import { deriveWebhookSecret, type LogSink } from "@aerobrief/core";
import { WebhookLimitError } from "@aerobrief/db";
import { describe, expect, it, vi } from "vitest";
import { createWebhookHandlers, type WebhookListItem, type WebhookRepos } from "../src/handlers/webhooks";
import { createFetchHandler, type Phase2Route, type Session } from "../src/router";
import { unknownRouteResponse } from "../src/router";

const ORIGIN = "https://app.example.com";
const MASTER = "m".repeat(40);
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-11-20T12:00:00.000Z");
const SECRET_URL = "https://hooks.example.com/services/T000/B000/XXXSECRETPATH";

const baseEnv = {
  DATABASE_URL: "postgresql://user:dbpass_secret@host.neon.tech/db?sslmode=require",
  RESEND_API_KEY: "re_secret_value",
  UNSUBSCRIBE_SECRET: "unsub_secret_value",
  FRONTEND_URL: ORIGIN,
  MAIL_FROM: "AeroBrief <alerts@example.com>",
};
const envOn = { ...baseEnv, FEATURE_WEBHOOKS: "true", WEBHOOK_MASTER_SECRET: MASTER };

interface Row extends WebhookListItem {
  userId: string;
  url: string;
}

/** In-memory repository with the same cap, scoping and idempotence rules as the real one. */
function fakeRepos() {
  const rows: Row[] = [];
  const repos: WebhookRepos = {
    webhooks: {
      list: async (userId) => rows.filter((r) => r.userId === userId),
      insert: async (input, now) => {
        if (rows.filter((r) => r.userId === input.userId).length >= 3) throw new WebhookLimitError();
        const row: Row = {
          id: input.id,
          userId: input.userId,
          url: input.url,
          host: input.host,
          createdAt: now,
          state: "active",
          lastOutcome: null,
          lastOutcomeAt: null,
          disabledAt: null,
        };
        rows.push(row);
        return row;
      },
      delete: async (userId, id) => {
        const i = rows.findIndex((r) => r.id === id && r.userId === userId);
        if (i < 0) return false;
        rows.splice(i, 1);
        return true;
      },
      reenable: async (userId, id) => {
        const row = rows.find((r) => r.id === id && r.userId === userId);
        if (row === undefined) return undefined;
        row.state = "active";
        row.disabledAt = null;
        return row;
      },
    },
  };
  return { repos, rows };
}

function setup(env: Record<string, string> = envOn) {
  const { repos, rows } = fakeRepos();
  const h = createWebhookHandlers({ repos: () => repos });
  const on = (f: { FEATURE_WEBHOOKS: boolean }): boolean => f.FEATURE_WEBHOOKS;
  const table: Phase2Route[] = [
    { method: "GET", pattern: "/api/webhooks", auth: "session", enabled: on, handler: h.listWebhooks },
    { method: "POST", pattern: "/api/webhooks", auth: "session", enabled: on, handler: h.createWebhook },
    { method: "DELETE", pattern: "/api/webhooks/:id", auth: "session", enabled: on, handler: h.deleteWebhook },
    { method: "POST", pattern: "/api/webhooks/:id/reenable", auth: "session", enabled: on, handler: h.reenableWebhook },
  ];
  const lines: string[] = [];
  const write = vi.fn((line: string): void => {
    lines.push(line);
  });
  const sink: LogSink = { debug: write, info: write, warn: write, error: write };
  const fetchHandler = createFetchHandler([], {
    phase2Routes: table,
    logSink: sink,
    now: () => NOW,
    resolveSession: async (hash): Promise<Session | null> =>
      hash.length > 0 ? { sessionId: "s", userId: USER, email: "a@b.co", tokenHash: hash } : null,
  });
  function send(method: string, path: string, opts: { body?: unknown; cookie?: boolean; json?: boolean } = {}) {
    const headers: Record<string, string> = { Origin: ORIGIN };
    if (opts.cookie !== false) headers["Cookie"] = "aerobrief_session=tok";
    if (opts.json !== false && method !== "GET" && method !== "DELETE") headers["Content-Type"] = "application/json";
    const init: RequestInit = { method, headers };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    return fetchHandler(new Request(`https://api.example.com${path}`, init), env);
  }
  return { send, rows, lines };
}

function seed(rows: Row[], userId = USER, id = "33333333-3333-4333-8333-333333333333"): Row {
  const row: Row = {
    id,
    userId,
    url: SECRET_URL,
    host: "hooks.example.com",
    createdAt: NOW,
    state: "disabled",
    lastOutcome: "failed",
    lastOutcomeAt: NOW,
    disabledAt: NOW,
  };
  rows.push(row);
  return row;
}

describe("webhook routes", () => {
  it("returns the derived secret once, on create only", async () => {
    const { send } = setup();
    const res = await send("POST", "/api/webhooks", { body: { url: SECRET_URL } });
    expect(res.status).toBe(201);
    const created = (await res.json()) as WebhookListItem & { secret: string };
    expect(created.secret).toBe(await deriveWebhookSecret(MASTER, created.id));
    expect(created.host).toBe("hooks.example.com");
    const list = await (await send("GET", "/api/webhooks")).text();
    expect(list).not.toContain(created.secret);
    expect(list).not.toContain("secret");
  });

  it("lists only the masked fields", async () => {
    const { send, rows } = setup();
    seed(rows);
    const res = await send("GET", "/api/webhooks");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { webhooks: Record<string, unknown>[] };
    expect(Object.keys(body.webhooks[0] ?? {}).sort()).toEqual(
      ["createdAt", "disabledAt", "host", "id", "lastOutcome", "lastOutcomeAt", "state"].sort(),
    );
    expect(JSON.stringify(body)).not.toContain("XXXSECRETPATH");
  });

  it("rejects a 4th webhook with 400 and leaves the rows unchanged", async () => {
    const { send, rows } = setup();
    for (let i = 0; i < 3; i++) {
      expect((await send("POST", "/api/webhooks", { body: { url: `https://h${i}.example.com/x` } })).status).toBe(201);
    }
    const before = JSON.stringify(rows);
    const res = await send("POST", "/api/webhooks", { body: { url: "https://h9.example.com/x" } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("webhook_limit");
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("rejects an unsafe URL with 400 and stores nothing", async () => {
    const { send, rows, lines } = setup();
    const res = await send("POST", "/api/webhooks", { body: { url: "https://127.0.0.1/hook?token=LEAKME" } });
    expect(res.status).toBe(400);
    expect(rows).toHaveLength(0);
    expect(await res.text()).not.toContain("LEAKME");
    expect(lines.join("\n")).not.toContain("LEAKME");
  });

  it("rejects a malformed body with 400", async () => {
    const { send } = setup();
    expect((await send("POST", "/api/webhooks", { body: { url: 5 } })).status).toBe(400);
  });

  it("answers a foreign or unknown id with 404 and leaves the other user's row", async () => {
    const { send, rows } = setup();
    const foreign = seed(rows, OTHER);
    expect((await send("DELETE", `/api/webhooks/${foreign.id}`)).status).toBe(404);
    expect((await send("POST", `/api/webhooks/${foreign.id}/reenable`, { body: {} })).status).toBe(404);
    expect((await send("DELETE", "/api/webhooks/not-a-uuid")).status).toBe(404);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.state).toBe("disabled");
  });

  it("deletes an owned webhook with a bodiless DELETE", async () => {
    const { send, rows } = setup();
    const own = seed(rows);
    expect((await send("DELETE", `/api/webhooks/${own.id}`)).status).toBe(200);
    expect(rows).toHaveLength(0);
  });

  it("re-enable twice equals once, with or without a body", async () => {
    const { send, rows } = setup();
    const own = seed(rows);
    const first = await send("POST", `/api/webhooks/${own.id}/reenable`);
    const afterFirst = JSON.stringify(rows);
    const second = await send("POST", `/api/webhooks/${own.id}/reenable`, { body: {} });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(JSON.stringify(rows)).toBe(afterFirst);
    expect(rows[0]?.state).toBe("active");
    expect(((await second.json()) as WebhookListItem).disabledAt).toBeNull();
  });

  it("answers 401 without a session on every route", async () => {
    const { send } = setup();
    const id = "33333333-3333-4333-8333-333333333333";
    const calls = [
      send("GET", "/api/webhooks", { cookie: false }),
      send("POST", "/api/webhooks", { cookie: false, body: { url: SECRET_URL } }),
      send("DELETE", `/api/webhooks/${id}`, { cookie: false }),
      send("POST", `/api/webhooks/${id}/reenable`, { cookie: false }),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
  });

  it("applies the watchlist request checks: Origin, JSON content type", async () => {
    const { send } = setup();
    const noOrigin = await createFetchHandler([], { phase2Routes: [] })(
      new Request("https://api.example.com/api/webhooks", { method: "POST" }),
      envOn,
    );
    expect(noOrigin.status).toBe(404);
    const res = await send("POST", "/api/webhooks", { body: { url: SECRET_URL }, json: false });
    expect(res.status).toBe(415);
  });

  it("answers 503 naming the variable when the master secret is missing", async () => {
    const { send } = setup({ ...baseEnv, FEATURE_WEBHOOKS: "true" });
    const res = await send("GET", "/api/webhooks");
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("WEBHOOK_MASTER_SECRET");
  });

  it("logs neither the URL nor the secret when the repository fails", async () => {
    const h = createWebhookHandlers({
      repos: () => ({
        webhooks: {
          list: async () => [],
          insert: async () => {
            throw new Error("db down");
          },
          delete: async () => false,
          reenable: async () => undefined,
        },
      }),
    });
    const lines: string[] = [];
    const write = (line: string): void => {
      lines.push(line);
    };
    const handler = createFetchHandler([], {
      logSink: { debug: write, info: write, warn: write, error: write },
      resolveSession: async (hash) => ({ sessionId: "s", userId: USER, email: "a@b.co", tokenHash: hash }),
      phase2Routes: [
        { method: "POST", pattern: "/api/webhooks", auth: "session", enabled: () => true, handler: h.createWebhook },
      ],
    });
    const res = await handler(
      new Request("https://api.example.com/api/webhooks", {
        method: "POST",
        headers: { Origin: ORIGIN, Cookie: "aerobrief_session=tok", "Content-Type": "application/json" },
        body: JSON.stringify({ url: SECRET_URL }),
      }),
      envOn,
    );
    expect(res.status).toBe(503);
    const logged = lines.join("\n");
    expect(logged).not.toContain("XXXSECRETPATH");
    expect(logged).not.toContain(MASTER);
    expect(logged).not.toContain("whsec_");
  });
});

describe("webhook routes with the real table", () => {
  it("flags off: every webhook route is byte-equal to an unknown path", async () => {
    const handler = createFetchHandler([]);
    const snap = async (res: Response) => ({
      status: res.status,
      headers: [...res.headers.entries()].sort(),
      body: await res.text(),
    });
    const id = "33333333-3333-4333-8333-333333333333";
    const cases: [string, string][] = [
      ["GET", "/api/webhooks"],
      ["POST", "/api/webhooks"],
      ["DELETE", `/api/webhooks/${id}`],
      ["POST", `/api/webhooks/${id}/reenable`],
    ];
    const expected = await snap(unknownRouteResponse());
    for (const [method, path] of cases) {
      const res = await handler(new Request(`https://api.example.com${path}`, { method }), baseEnv);
      expect(await snap(res)).toEqual(expected);
    }
  });
});
