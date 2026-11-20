import { signDigestUnsubscribe } from "@aerobrief/core";
import { describe, expect, it } from "vitest";
import { createDigestHandlers, type DigestPreference, type DigestRepos } from "../src/handlers/digest";
import { createFetchHandler, type Phase2Route, type Session } from "../src/router";

const ORIGIN = "https://app.example.com";
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-11-20T12:00:00.000Z");
const SECRET = "unsub_secret_value";
const PREVIOUS = "previous_secret_value";

const baseEnv: Record<string, string> = {
  DATABASE_URL: "postgresql://user:dbpass_secret@host.neon.tech/db?sslmode=require",
  RESEND_API_KEY: "re_secret_value",
  UNSUBSCRIBE_SECRET: SECRET,
  FRONTEND_URL: ORIGIN,
  MAIL_FROM: "AeroBrief <alerts@example.com>",
};
const envOn = { ...baseEnv, FEATURE_DIGESTS: "true" };

/** In-memory repository with the same upsert and idempotent-disable rules as the real one. */
function setup(env: Record<string, string> = envOn) {
  const prefs = new Map<string, DigestPreference>();
  const writes: string[] = [];
  const repos: DigestRepos = {
    digest: {
      getPreference: async (userId) => prefs.get(userId),
      upsertPreference: async (input) => {
        writes.push("upsert");
        const row = { enabled: input.enabled, hour: input.hour };
        prefs.set(input.userId, row);
        return row;
      },
      disable: async (userId) => {
        writes.push("disable");
        const row = prefs.get(userId);
        if (row === undefined) return false;
        row.enabled = false;
        return true;
      },
    },
  };
  const h = createDigestHandlers({ repos: () => repos });
  const on = (f: { FEATURE_DIGESTS: boolean }): boolean => f.FEATURE_DIGESTS;
  const table: Phase2Route[] = [
    { method: "GET", pattern: "/api/digest", auth: "session", enabled: on, handler: h.getDigest },
    { method: "PUT", pattern: "/api/digest", auth: "session", enabled: on, handler: h.putDigest },
    { method: "POST", pattern: "/api/digest/unsubscribe", auth: "none", enabled: on, handler: h.unsubscribeDigest },
  ];
  const fetchHandler = createFetchHandler([], {
    phase2Routes: table,
    now: () => NOW,
    resolveSession: async (hash): Promise<Session | null> =>
      hash.length > 0 ? { sessionId: "s", userId: USER, email: "a@b.co", tokenHash: hash } : null,
  });
  function send(method: string, path: string, opts: { body?: unknown; cookie?: boolean; env?: Record<string, string> } = {}) {
    const headers: Record<string, string> = { Origin: ORIGIN };
    if (opts.cookie !== false) headers["Cookie"] = "aerobrief_session=tok";
    if (method !== "GET") headers["Content-Type"] = "application/json";
    const init: RequestInit = { method, headers };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    return fetchHandler(new Request(`https://api.example.com${path}`, init), opts.env ?? env);
  }
  return { send, prefs, writes };
}

async function snap(res: Response) {
  return { status: res.status, headers: [...res.headers.entries()].sort(), body: await res.text() };
}

describe("GET and PUT /api/digest", () => {
  it("returns the default for a user without a row", async () => {
    const { send } = setup();
    const res = await send("GET", "/api/digest");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false, hour: 7 });
  });

  it("returns the saved preference after a PUT", async () => {
    const { send, prefs } = setup();
    const put = await send("PUT", "/api/digest", { body: { enabled: true, hour: 18 } });
    expect(put.status).toBe(200);
    expect(prefs.get(USER)).toEqual({ enabled: true, hour: 18 });
    const res = await send("GET", "/api/digest");
    expect(await res.json()).toEqual({ enabled: true, hour: 18 });
  });

  it.each([
    ["hour 24", { enabled: true, hour: 24 }],
    ["hour -1", { enabled: true, hour: -1 }],
    ["hour not an integer", { enabled: true, hour: 7.5 }],
    ["hour a string", { enabled: true, hour: "7" }],
    ["enabled missing", { hour: 7 }],
    ["enabled not boolean", { enabled: "yes", hour: 7 }],
    ["hour missing", { enabled: true }],
  ])("rejects %s with 400 and writes nothing", async (_name, body) => {
    const { send, writes } = setup();
    const res = await send("PUT", "/api/digest", { body });
    expect(res.status).toBe(400);
    expect(writes).toEqual([]);
  });

  it("returns 401 without a session for GET and PUT, and writes nothing", async () => {
    const { send, writes } = setup();
    expect((await send("GET", "/api/digest", { cookie: false })).status).toBe(401);
    expect((await send("PUT", "/api/digest", { cookie: false, body: { enabled: true, hour: 7 } })).status).toBe(401);
    expect(writes).toEqual([]);
  });
});

describe("POST /api/digest/unsubscribe", () => {
  it("disables the preference for a good signature, without a session, and repeats with 200", async () => {
    const { send, prefs } = setup();
    prefs.set(USER, { enabled: true, hour: 9 });
    const sig = await signDigestUnsubscribe(USER, SECRET);
    const first = await send("POST", "/api/digest/unsubscribe", { cookie: false, body: { userId: USER, sig } });
    expect(first.status).toBe(200);
    expect(prefs.get(USER)).toEqual({ enabled: false, hour: 9 });
    const again = await send("POST", "/api/digest/unsubscribe", { cookie: false, body: { userId: USER, sig } });
    expect(again.status).toBe(200);
    expect(prefs.get(USER)).toEqual({ enabled: false, hour: 9 });
  });

  it("answers 200 when the user has no row", async () => {
    const { send, prefs } = setup();
    const sig = await signDigestUnsubscribe(USER, SECRET);
    const res = await send("POST", "/api/digest/unsubscribe", { cookie: false, body: { userId: USER, sig } });
    expect(res.status).toBe(200);
    expect(prefs.size).toBe(0);
  });

  it("returns 403 and changes nothing for a bad signature or another user's signature", async () => {
    const { send, prefs, writes } = setup();
    prefs.set(USER, { enabled: true, hour: 9 });
    const wrong = await signDigestUnsubscribe(USER, "some_other_secret");
    const forOther = await signDigestUnsubscribe(OTHER, SECRET);
    const valid = await signDigestUnsubscribe(USER, SECRET);
    const nonCanonical = valid.slice(0, -1) + (valid.endsWith("A") ? "B" : "A");
    for (const sig of [wrong, forOther, "not-a-signature", "!!!", nonCanonical, `${valid}=`, ` ${valid}`]) {
      const res = await send("POST", "/api/digest/unsubscribe", { cookie: false, body: { userId: USER, sig } });
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("invalid_signature");
    }
    expect(prefs.get(USER)).toEqual({ enabled: true, hour: 9 });
    expect(writes).toEqual([]);
  });

  it("returns 400 for a malformed body or a non-UUID userId, and writes nothing", async () => {
    const { send, writes } = setup();
    const sig = await signDigestUnsubscribe("not-a-uuid", SECRET);
    expect((await send("POST", "/api/digest/unsubscribe", { cookie: false, body: { userId: "not-a-uuid", sig } })).status).toBe(400);
    expect((await send("POST", "/api/digest/unsubscribe", { cookie: false, body: { userId: USER } })).status).toBe(400);
    expect(writes).toEqual([]);
  });

  it("accepts the previous secret before its expiry and rejects it after", async () => {
    const sig = await signDigestUnsubscribe(USER, PREVIOUS);
    const before = setup({
      ...envOn,
      UNSUBSCRIBE_SECRET_PREVIOUS: PREVIOUS,
      UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT: "2026-11-21T00:00:00.000Z",
    });
    expect((await before.send("POST", "/api/digest/unsubscribe", { cookie: false, body: { userId: USER, sig } })).status).toBe(200);

    const after = setup({
      ...envOn,
      UNSUBSCRIBE_SECRET_PREVIOUS: PREVIOUS,
      UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT: "2026-11-20T11:00:00.000Z",
    });
    after.prefs.set(USER, { enabled: true, hour: 7 });
    expect((await after.send("POST", "/api/digest/unsubscribe", { cookie: false, body: { userId: USER, sig } })).status).toBe(403);
    expect(after.prefs.get(USER)?.enabled).toBe(true);
  });
});

describe("flag off", () => {
  it("answers all three routes exactly like an unknown path", async () => {
    const { send, writes } = setup(baseEnv);
    const sig = await signDigestUnsubscribe(USER, SECRET);
    const cases: [string, string, unknown][] = [
      ["GET", "/api/digest", undefined],
      ["PUT", "/api/digest", { enabled: true, hour: 7 }],
      ["POST", "/api/digest/unsubscribe", { userId: USER, sig }],
    ];
    for (const [method, path, body] of cases) {
      const a = await snap(await send(method, path, { body }));
      const b = await snap(await send(method, `${path}-nope`, { body }));
      expect(a.status).toBe(404);
      expect({ ...a, body: JSON.parse(a.body) }).toEqual({ ...b, body: JSON.parse(b.body) });
    }
    expect(writes).toEqual([]);
  });
});
