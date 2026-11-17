import { createLogger, type LogSink } from "@aerobrief/core";
import type { NewMagicLink, NewSession } from "@aerobrief/db";
import type { SendEmailOptions, SendEmailResult } from "@aerobrief/mail";
import { describe, expect, it, vi } from "vitest";
import { createAuthHandlers, type AuthRepos } from "../src/handlers/auth";
import type { Env } from "../src/env";
import { ApiError } from "../src/http";
import { SESSION_COOKIE, sha256Hex, type RouteContext, type Session } from "../src/router";

const NOW = new Date("2025-01-02T12:00:00.000Z");
const env: Env = {
  DATABASE_URL: "postgresql://user:dbpass_secret@host.neon.tech/db?sslmode=require",
  RESEND_API_KEY: "re_secret_value",
  UNSUBSCRIBE_SECRET: "unsub_secret_value",
  FRONTEND_URL: "https://app.example.com",
  MAIL_FROM: "AeroBrief <alerts@example.com>",
};
const req = new Request("https://api.example.com/x", { method: "POST" });

function makeLogs() {
  const lines: string[] = [];
  const write = (line: string): void => {
    lines.push(line);
  };
  const sink: LogSink = { debug: write, info: write, warn: write, error: write };
  return { logger: createLogger([env.RESEND_API_KEY], sink), lines };
}

function makeCtx(body: unknown, session: Session | null = null) {
  const { logger, lines } = makeLogs();
  const ctx: RouteContext = {
    params: {},
    session,
    now: NOW,
    body,
    url: new URL("https://api.example.com/x"),
    signal: new AbortController().signal,
    logger,
  };
  return { ctx, lines };
}

function makeRepos(recent = 0, redeemEmail: string | null = null) {
  const create = vi.fn(async (_input: NewMagicLink): Promise<void> => undefined);
  const redeem = vi.fn(async (_hash: string, _now: Date): Promise<string | null> => redeemEmail);
  const invalidate = vi.fn(async (_hash: string, _now: Date): Promise<void> => undefined);
  const countRecent = vi.fn(async (_email: string, _now: Date): Promise<number> => recent);
  const upsertByEmail = vi.fn(async (email: string, now: Date) => ({ id: "user-1", email, createdAt: now }));
  const sessionCreate = vi.fn(async (_input: NewSession): Promise<void> => undefined);
  const sessionDelete = vi.fn(async (_hash: string): Promise<void> => undefined);
  const repos: AuthRepos = {
    users: { upsertByEmail },
    sessions: { create: sessionCreate, delete: sessionDelete },
    magicLinks: { create, redeem, invalidate, countRecent },
  };
  return { repos, create, redeem, invalidate, countRecent, upsertByEmail, sessionCreate, sessionDelete };
}

function makeSend(result: SendEmailResult) {
  return vi.fn(async (_opts: SendEmailOptions): Promise<SendEmailResult> => result);
}

const sendOk: SendEmailResult = { ok: true, id: "m1", attempts: 1, idempotencyKey: "k" };
const sendFail: SendEmailResult = {
  ok: false,
  attempts: 3,
  idempotencyKey: "k",
  status: 500,
  error: "http_status:500",
};

async function thrown(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof ApiError) return err;
    throw err;
  }
  throw new Error("expected ApiError");
}

describe("POST /api/auth/magic-link", () => {
  it("stores only the token hash with a 15-minute expiry and emails the link", async () => {
    const r = makeRepos();
    const send = makeSend(sendOk);
    const { magicLink } = createAuthHandlers({ repos: () => r.repos, send, newToken: () => "tok_abc" });
    const { ctx } = makeCtx({ email: "  User@Example.COM " });

    const res = await magicLink(req, env, ctx);

    expect(res.status).toBe(200);
    expect(r.create).toHaveBeenCalledTimes(1);
    const stored = r.create.mock.calls[0]?.[0];
    expect(stored?.email).toBe("user@example.com");
    expect(stored?.tokenHash).toBe(await sha256Hex("tok_abc"));
    expect(stored?.tokenHash).not.toBe("tok_abc");
    expect(stored?.expiresAt.getTime()).toBe(NOW.getTime() + 15 * 60 * 1000);

    const sent = send.mock.calls[0]?.[0];
    expect(sent?.message.to).toBe("user@example.com");
    expect(sent?.message.text).toContain("https://app.example.com/auth/callback#token=tok_abc");
    expect(r.invalidate).not.toHaveBeenCalled();
  });

  it("rejects an invalid email with 400 and creates nothing", async () => {
    const r = makeRepos();
    const send = makeSend(sendOk);
    const { magicLink } = createAuthHandlers({ repos: () => r.repos, send });
    for (const body of [{ email: "not-an-email" }, { email: `${"a".repeat(250)}@b.co` }, {}, undefined]) {
      const err = await thrown(magicLink(req, env, makeCtx(body).ctx));
      expect(err.status).toBe(400);
    }
    expect(r.create).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("returns 429 at 5 recent requests and creates no link or email", async () => {
    const r = makeRepos(5);
    const send = makeSend(sendOk);
    const { magicLink } = createAuthHandlers({ repos: () => r.repos, send });
    const err = await thrown(magicLink(req, env, makeCtx({ email: "a@b.co" }).ctx));
    expect(err.status).toBe(429);
    expect(err.code).toBe("rate_limited");
    expect(r.create).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("allows the 5th request (4 recent)", async () => {
    const r = makeRepos(4);
    const { magicLink } = createAuthHandlers({ repos: () => r.repos, send: makeSend(sendOk) });
    const res = await magicLink(req, env, makeCtx({ email: "a@b.co" }).ctx);
    expect(res.status).toBe(200);
  });

  it("invalidates the link and returns an error when Resend fails, without logging the token", async () => {
    const r = makeRepos();
    const { magicLink } = createAuthHandlers({
      repos: () => r.repos,
      send: makeSend(sendFail),
      newToken: () => "tok_secret_xyz",
    });
    const { ctx, lines } = makeCtx({ email: "a@b.co" });
    const err = await thrown(magicLink(req, env, ctx));
    expect(err.status).toBe(502);
    expect(err.code).toBe("email_send_failed");
    expect(r.invalidate).toHaveBeenCalledTimes(1);
    expect(r.invalidate.mock.calls[0]?.[0]).toBe(await sha256Hex("tok_secret_xyz"));
    expect(lines.join("\n")).not.toContain("tok_secret_xyz");
  });
});

describe("POST /api/auth/redeem", () => {
  it("creates a hashed 30-day Session and sets a HttpOnly Secure SameSite=Lax cookie", async () => {
    const r = makeRepos(0, "user@example.com");
    const tokens = ["session_tok"];
    const { redeem } = createAuthHandlers({ repos: () => r.repos, newToken: () => tokens[0] ?? "" });
    const res = await redeem(req, env, makeCtx({ token: "link_tok" }).ctx);

    expect(res.status).toBe(200);
    expect(r.redeem.mock.calls[0]?.[0]).toBe(await sha256Hex("link_tok"));
    const created = r.sessionCreate.mock.calls[0]?.[0];
    expect(created?.userId).toBe("user-1");
    expect(created?.tokenHash).toBe(await sha256Hex("session_tok"));
    expect(created?.expiresAt.getTime()).toBe(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);

    const cookie = res.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE}=session_tok`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=2592000");
    expect(await res.json()).toEqual({ email: "user@example.com" });
  });

  it("rejects an invalid, used or expired link with 400 and creates no Session", async () => {
    const r = makeRepos(0, null);
    const { redeem } = createAuthHandlers({ repos: () => r.repos });
    const err = await thrown(redeem(req, env, makeCtx({ token: "nope" }).ctx));
    expect(err.status).toBe(400);
    expect(err.code).toBe("invalid_link");
    expect(r.upsertByEmail).not.toHaveBeenCalled();
    expect(r.sessionCreate).not.toHaveBeenCalled();
  });

  it("rejects a missing token with 400", async () => {
    const r = makeRepos();
    const { redeem } = createAuthHandlers({ repos: () => r.repos });
    const err = await thrown(redeem(req, env, makeCtx({}).ctx));
    expect(err.status).toBe(400);
    expect(r.redeem).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/logout", () => {
  it("deletes the Session by token hash and clears the cookie", async () => {
    const r = makeRepos();
    const { logout } = createAuthHandlers({ repos: () => r.repos });
    const session: Session = { sessionId: "s1", userId: "u1", email: "a@b.co", tokenHash: "hash1" };
    const res = await logout(req, env, makeCtx(undefined, session).ctx);
    expect(res.status).toBe(200);
    expect(r.sessionDelete.mock.calls[0]?.[0]).toBe("hash1");
    expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  it("returns 401 without a session", async () => {
    const r = makeRepos();
    const { logout } = createAuthHandlers({ repos: () => r.repos });
    const err = await thrown(logout(req, env, makeCtx(undefined).ctx));
    expect(err.status).toBe(401);
    expect(r.sessionDelete).not.toHaveBeenCalled();
  });
});
