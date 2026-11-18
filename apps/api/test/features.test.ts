import type { LogSink } from "@aerobrief/core";
import { describe, expect, it, vi } from "vitest";
import { createFlagReader, featuresHandler } from "../src/features";
import { createFetchHandler } from "../src/router";
import { routesPhase2 } from "../src/routes-phase2";

const baseEnv = {
  DATABASE_URL: "postgresql://user:dbpass_secret@host.neon.tech/db?sslmode=require",
  RESEND_API_KEY: "re_secret_value",
  UNSUBSCRIBE_SECRET: "unsub_secret_value",
  FRONTEND_URL: "https://app.example.com",
  MAIL_FROM: "AeroBrief <alerts@example.com>",
};

function makeSink() {
  const lines: string[] = [];
  const write = vi.fn((line: string): void => {
    lines.push(line);
  });
  const sink: LogSink = { debug: write, info: write, warn: write, error: write };
  return { sink, lines };
}

function build(extra: Record<string, string> = {}) {
  const { sink, lines } = makeSink();
  const handler = createFetchHandler([], { logSink: sink, phase2Routes: routesPhase2 });
  const env = { ...baseEnv, ...extra };
  return { handler, env, lines };
}

const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://api.example.com${path}`, { headers });

describe("GET /api/features", () => {
  it("answers 200 with one boolean per flag and no-store while a flag is on", async () => {
    const { handler, env } = build({ FEATURE_DARK_MODE: "true", FEATURE_WEBHOOKS: "false" });
    const res = await handler(get("/api/features"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ darkMode: true, highContrast: false, digests: false, webhooks: false });
  });

  it("reflects every flag", async () => {
    const { handler, env } = build({
      FEATURE_DARK_MODE: "true",
      FEATURE_HIGH_CONTRAST: "true",
      FEATURE_DIGESTS: "true",
      FEATURE_WEBHOOKS: "true",
    });
    const res = await handler(get("/api/features"), env);
    expect(await res.json()).toEqual({ darkMode: true, highContrast: true, digests: true, webhooks: true });
  });

  it("ignores cookies and needs no session or database", async () => {
    const { handler, env } = build({ FEATURE_DIGESTS: "true" });
    // The default resolveSession fails closed, so a 200 shows the route never resolves a session.
    const res = await handler(get("/api/features", { Cookie: "aerobrief_session=anything" }), env);
    expect(res.status).toBe(200);
  });

  it("answers 404 with the unknown-route response while all flags are off", async () => {
    const { handler, env } = build();
    const res = await handler(get("/api/features"), env);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "Not found." } });
  });

  it("treats an invalid value as off", async () => {
    const { handler, env } = build({ FEATURE_DARK_MODE: "TRUE" });
    expect((await handler(get("/api/features"), env)).status).toBe(404);
  });

  it("handler falls back to all-off when no flags are on the context", async () => {
    const res = await featuresHandler(get("/api/features"), {} as never, { } as never);
    expect(await res.json()).toEqual({ darkMode: false, highContrast: false, digests: false, webhooks: false });
  });
});

describe("createFlagReader", () => {
  it("logs a warning naming the flag once per env and never the value", async () => {
    const { handler, env, lines } = build({ FEATURE_DIGESTS: "secret-looking-value", FEATURE_DARK_MODE: "true" });
    await handler(get("/api/features"), env);
    await handler(get("/api/features"), env);
    const warns = lines.filter((l) => l.includes("invalid_feature_flag"));
    expect(warns).toHaveLength(1);
    expect(warns[0]).toContain("FEATURE_DIGESTS");
    expect(lines.join("\n")).not.toContain("secret-looking-value");
  });

  it("ignores non-string values and non-object env", () => {
    const { sink } = makeSink();
    const read = createFlagReader({ debug() {}, info() {}, warn() {}, error() {} } as never);
    void sink;
    expect(read(null).FEATURE_DARK_MODE).toBe(false);
    expect(read({ FEATURE_DARK_MODE: true }).FEATURE_DARK_MODE).toBe(false);
  });
});
