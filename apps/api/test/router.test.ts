import type { LogSink } from "@aerobrief/core";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import { ApiError, errorResponse, jsonResponse } from "../src/http";
import {
  SESSION_COOKIE,
  createFetchHandler,
  matchPattern,
  sha256Hex,
  type RouteContext,
  type Route,
  type Session,
} from "../src/router";

const DATABASE_URL = "postgresql://user:dbpass_secret@host.neon.tech/db?sslmode=require";
const rawEnv = {
  DATABASE_URL,
  RESEND_API_KEY: "re_secret_value",
  UNSUBSCRIBE_SECRET: "unsub_secret_value",
  FRONTEND_URL: "https://app.example.com",
  MAIL_FROM: "AeroBrief <alerts@example.com>",
};
const ORIGIN = "https://app.example.com";
const NOW = new Date("2025-01-02T12:00:00.000Z");

const session: Session = { sessionId: "s1", userId: "u1", email: "a@b.co", tokenHash: "h" };

function makeHandler() {
  return vi.fn(
    async (_req: Request, _env: Env, _ctx: RouteContext): Promise<Response> => jsonResponse(200, { ok: true }),
  );
}

function makeSink() {
  const lines: string[] = [];
  const write = vi.fn((line: string): void => {
    lines.push(line);
  });
  const sink: LogSink = { debug: write, info: write, warn: write, error: write };
  return { sink, lines };
}

function build(routes: readonly Route[], extra: Parameters<typeof createFetchHandler>[1] = {}) {
  const { sink, lines } = makeSink();
  const fetchHandler = createFetchHandler(routes, { now: () => NOW, logSink: sink, ...extra });
  return { fetchHandler, lines };
}

async function errorOf(res: Response): Promise<{ code: string; message: string }> {
  const json = (await res.json()) as { error: { code: string; message: string } };
  return json.error;
}

function post(path: string, init: { origin?: string | null; contentType?: string | null; body?: string; cookie?: string } = {}) {
  const headers = new Headers();
  if (init.origin !== null) headers.set("Origin", init.origin ?? ORIGIN);
  if (init.contentType !== null) headers.set("Content-Type", init.contentType ?? "application/json");
  if (init.cookie !== undefined) headers.set("Cookie", init.cookie);
  return new Request(`https://api.example.com${path}`, {
    method: "POST",
    headers,
    body: init.body ?? "{}",
  });
}

describe("matchPattern", () => {
  it("matches static and param segments and decodes params", () => {
    expect(matchPattern("/api/status/airport/:code", "/api/status/airport/JFK")).toEqual({ code: "JFK" });
    expect(matchPattern("/api/x/:code", "/api/x/a%20b")).toEqual({ code: "a b" });
  });

  it("rejects different lengths, different statics and bad encoding", () => {
    expect(matchPattern("/api/health", "/api/health/extra")).toBeNull();
    expect(matchPattern("/api/health", "/api/other")).toBeNull();
    expect(matchPattern("/api/x/:code", "/api/x/%E0%A4%A")).toBeNull();
  });
});

describe("routing", () => {
  it("passes params, now and a null session to a matched none-auth handler", async () => {
    const handler = makeHandler();
    const { fetchHandler } = build([{ method: "GET", pattern: "/api/status/airport/:code", auth: "none", handler }]);
    const res = await fetchHandler(new Request("https://api.example.com/api/status/airport/JFK"), rawEnv);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    const ctx = handler.mock.calls[0]?.[2];
    expect(ctx?.params).toEqual({ code: "JFK" });
    expect(ctx?.now).toEqual(NOW);
    expect(ctx?.session).toBeNull();
  });

  it("returns 404 in the error envelope for an unknown path", async () => {
    const { fetchHandler } = build([]);
    const res = await fetchHandler(new Request("https://api.example.com/nope"), rawEnv);
    expect(res.status).toBe(404);
    expect((await errorOf(res)).code).toBe("not_found");
  });

  it("returns 405 with Allow when the path exists for another method", async () => {
    const handler = makeHandler();
    const { fetchHandler } = build([{ method: "GET", pattern: "/api/health", auth: "none", handler }]);
    const res = await fetchHandler(post("/api/health"), rawEnv);
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET");
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("env validation", () => {
  it("returns 500 and logs only key names when env is invalid", async () => {
    const handler = makeHandler();
    const { fetchHandler, lines } = build([{ method: "GET", pattern: "/api/health", auth: "none", handler }]);
    const res = await fetchHandler(new Request("https://api.example.com/api/health"), {
      ...rawEnv,
      FRONTEND_URL: "not a url",
    });
    expect(res.status).toBe(500);
    expect(handler).not.toHaveBeenCalled();
    const logged = lines.join("\n");
    expect(logged).toContain("FRONTEND_URL");
    expect(logged).not.toContain("not a url");
    expect(logged).not.toContain("re_secret_value");
  });
});

describe("session auth", () => {
  const route = (handler: ReturnType<typeof makeHandler>): Route => ({
    method: "GET",
    pattern: "/api/watchlist",
    auth: "session",
    handler,
  });

  it("returns 401 without a cookie and does not call the handler", async () => {
    const handler = makeHandler();
    const { fetchHandler } = build([route(handler)]);
    const res = await fetchHandler(new Request("https://api.example.com/api/watchlist"), rawEnv);
    expect(res.status).toBe(401);
    expect((await errorOf(res)).code).toBe("unauthorized");
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 401 when the Session is unknown or expired (resolver returns null)", async () => {
    const handler = makeHandler();
    const resolveSession = vi.fn(
      async (_hash: string, _now: Date, _signal: AbortSignal): Promise<Session | null> => null,
    );
    const { fetchHandler } = build([route(handler)], { resolveSession });
    const res = await fetchHandler(
      new Request("https://api.example.com/api/watchlist", { headers: { Cookie: `${SESSION_COOKIE}=tok` } }),
      rawEnv,
    );
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("looks up the SHA-256 hex of the cookie token and passes the Session to the handler", async () => {
    const handler = makeHandler();
    const resolveSession = vi.fn(
      async (_hash: string, _now: Date, _signal: AbortSignal): Promise<Session | null> => session,
    );
    const { fetchHandler } = build([route(handler)], { resolveSession });
    const res = await fetchHandler(
      new Request("https://api.example.com/api/watchlist", {
        headers: { Cookie: `other=1; ${SESSION_COOKIE}=tok; x=y` },
      }),
      rawEnv,
    );
    expect(res.status).toBe(200);
    expect(resolveSession.mock.calls[0]?.[0]).toBe(await sha256Hex("tok"));
    expect(resolveSession.mock.calls[0]?.[1]).toEqual(NOW);
    expect(handler.mock.calls[0]?.[2].session).toEqual(session);
  });

  it("fails closed when no resolver is configured", async () => {
    const handler = makeHandler();
    const { fetchHandler } = build([route(handler)]);
    const res = await fetchHandler(
      new Request("https://api.example.com/api/watchlist", { headers: { Cookie: `${SESSION_COOKIE}=tok` } }),
      rawEnv,
    );
    expect(res.status).toBe(401);
  });

  it("does not resolve a Session for signature-auth routes", async () => {
    const handler = makeHandler();
    const resolveSession = vi.fn(
      async (_hash: string, _now: Date, _signal: AbortSignal): Promise<Session | null> => session,
    );
    const { fetchHandler } = build([{ method: "POST", pattern: "/api/unsubscribe", auth: "signature", handler }], {
      resolveSession,
    });
    const res = await fetchHandler(post("/api/unsubscribe", { cookie: `${SESSION_COOKIE}=tok` }), rawEnv);
    expect(res.status).toBe(200);
    expect(resolveSession).not.toHaveBeenCalled();
  });
});

describe("Origin and JSON checks", () => {
  const route = (handler: ReturnType<typeof makeHandler>): Route => ({
    method: "POST",
    pattern: "/api/watchlist",
    auth: "none",
    handler,
  });

  it("rejects a mutating request with a wrong or missing Origin with 403", async () => {
    const handler = makeHandler();
    const { fetchHandler } = build([route(handler)]);
    const wrong = await fetchHandler(post("/api/watchlist", { origin: "https://evil.example.com" }), rawEnv);
    const missing = await fetchHandler(post("/api/watchlist", { origin: null }), rawEnv);
    expect(wrong.status).toBe(403);
    expect(missing.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects a POST without application/json with 415", async () => {
    const handler = makeHandler();
    const { fetchHandler } = build([route(handler)]);
    const res = await fetchHandler(post("/api/watchlist", { contentType: "text/plain" }), rawEnv);
    expect(res.status).toBe(415);
    expect((await errorOf(res)).code).toBe("unsupported_media_type");
  });

  it("rejects malformed JSON with 400 and accepts a charset parameter", async () => {
    const handler = makeHandler();
    const { fetchHandler } = build([route(handler)]);
    const bad = await fetchHandler(post("/api/watchlist", { body: "{nope" }), rawEnv);
    expect(bad.status).toBe(400);
    expect((await errorOf(bad)).code).toBe("invalid_json");
    const ok = await fetchHandler(
      post("/api/watchlist", { contentType: "application/json; charset=utf-8", body: '{"airportId":"JFK"}' }),
      rawEnv,
    );
    expect(ok.status).toBe(200);
    expect(handler.mock.calls[0]?.[2].body).toEqual({ airportId: "JFK" });
  });

  it("allows a body-less DELETE with a matching Origin and no Content-Type", async () => {
    const handler = makeHandler();
    const { fetchHandler } = build([
      { method: "DELETE", pattern: "/api/watchlist/:code", auth: "none", handler },
    ]);
    const res = await fetchHandler(
      new Request("https://api.example.com/api/watchlist/JFK", { method: "DELETE", headers: { Origin: ORIGIN } }),
      rawEnv,
    );
    expect(res.status).toBe(200);
    expect(handler.mock.calls[0]?.[2].body).toBeUndefined();
    expect(handler.mock.calls[0]?.[2].params).toEqual({ code: "JFK" });
  });

  it("does not require Origin for GET", async () => {
    const handler = makeHandler();
    const { fetchHandler } = build([{ method: "GET", pattern: "/api/health", auth: "none", handler }]);
    const res = await fetchHandler(new Request("https://api.example.com/api/health"), rawEnv);
    expect(res.status).toBe(200);
  });
});

describe("failure handling", () => {
  const getRoute = (handler: Route["handler"]): Route => ({
    method: "GET",
    pattern: "/api/status/national",
    auth: "none",
    handler,
  });
  const req = () => new Request("https://api.example.com/api/status/national");

  it("returns 503 with Retry-After: 30 when the handler throws, and logs no secret", async () => {
    const handler = vi.fn(async (_req: Request, _env: Env, _ctx: RouteContext): Promise<Response> => {
      throw new Error(`connect failed for ${DATABASE_URL}`);
    });
    const { fetchHandler, lines } = build([getRoute(handler)]);
    const res = await fetchHandler(req(), rawEnv);
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect((await errorOf(res)).code).toBe("service_unavailable");
    const logged = lines.join("\n");
    expect(logged).toContain("request_failed");
    expect(logged).not.toContain("dbpass_secret");
  });

  it("returns 503 when Session lookup throws", async () => {
    const handler = makeHandler();
    const resolveSession = vi.fn(async (_hash: string, _now: Date, _signal: AbortSignal): Promise<Session | null> => {
      throw new Error("db down");
    });
    const { fetchHandler } = build([{ method: "GET", pattern: "/api/watchlist", auth: "session", handler }], {
      resolveSession,
    });
    const res = await fetchHandler(
      new Request("https://api.example.com/api/watchlist", { headers: { Cookie: `${SESSION_COOKIE}=tok` } }),
      rawEnv,
    );
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 503 and aborts ctx.signal when the handler exceeds the budget", async () => {
    let captured: AbortSignal | undefined;
    const handler = vi.fn(async (_req: Request, _env: Env, ctx: RouteContext): Promise<Response> => {
      captured = ctx.signal;
      return new Promise<Response>(() => undefined);
    });
    const { fetchHandler } = build([getRoute(handler)], { timeoutMs: 20 });
    const res = await fetchHandler(req(), rawEnv);
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(captured?.aborted).toBe(true);
  });

  it("uses a 5 s default budget (a fast handler is unaffected)", async () => {
    const { fetchHandler } = build([getRoute(makeHandler())]);
    const res = await fetchHandler(req(), rawEnv);
    expect(res.status).toBe(200);
  });

  it("maps a thrown ApiError to its status in the envelope with its headers", async () => {
    const handler = vi.fn(async (_req: Request, _env: Env, _ctx: RouteContext): Promise<Response> => {
      throw new ApiError(429, "rate_limited", "Too many requests.", { "Retry-After": "60" });
    });
    const { fetchHandler } = build([getRoute(handler)]);
    const res = await fetchHandler(req(), rawEnv);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(await errorOf(res)).toEqual({ code: "rate_limited", message: "Too many requests." });
  });

  it("passes through a handler-returned error response unchanged", async () => {
    const handler = vi.fn(
      async (_req: Request, _env: Env, _ctx: RouteContext): Promise<Response> =>
        errorResponse(409, "watchlist_full", "Watchlist is full."),
    );
    const { fetchHandler } = build([getRoute(handler)]);
    const res = await fetchHandler(req(), rawEnv);
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("watchlist_full");
  });
});
