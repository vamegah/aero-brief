import { deriveWebhookSecret, signWebhook, type LogSink } from "@aerobrief/core";
import type { SenderFetch } from "@aerobrief/webhook-sender";
import { describe, expect, it, vi } from "vitest";
import { createWebhookHandlers, type WebhookRepos } from "../src/handlers/webhooks";
import { createFetchHandler, type Phase2Route, type Session } from "../src/router";

const ORIGIN = "https://app.example.com";
const MASTER = "m".repeat(40);
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ID = "33333333-3333-4333-8333-333333333333";
const DELIVERY = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-11-20T12:00:00.000Z");
const URL_OK = "https://hooks.example.com/services/T000/B000/XXXSECRETPATH";

const baseEnv = {
  DATABASE_URL: "postgresql://user:dbpass_secret@host.neon.tech/db?sslmode=require",
  RESEND_API_KEY: "re_secret_value",
  UNSUBSCRIBE_SECRET: "unsub_secret_value",
  FRONTEND_URL: ORIGIN,
  MAIL_FROM: "AeroBrief <alerts@example.com>",
};
const envOn = { ...baseEnv, FEATURE_WEBHOOKS: "true", WEBHOOK_MASTER_SECRET: MASTER, SAFE_SEND_MODE: "false" };

interface Row {
  id: string;
  userId: string;
  url: string;
  host: string;
  state: string;
  lastTestAt: Date | null;
  lastTestOutcome: string | null;
  consecutiveFailures: number;
}

function setup(rowOver: Partial<Row> = {}, env: Record<string, string> = envOn) {
  const row: Row = {
    id: ID,
    userId: USER,
    url: URL_OK,
    host: "hooks.example.com",
    state: "active",
    lastTestAt: null,
    lastTestOutcome: null,
    consecutiveFailures: 2,
    ...rowOver,
  };
  const rows = [row];
  const deliveryWrites = vi.fn();
  const repos: WebhookRepos = {
    webhooks: {
      list: async () => [],
      insert: async () => undefined,
      delete: async () => false,
      reenable: async () => undefined,
      getForSend: async (userId, id) => {
        const r = rows.find((x) => x.id === id && x.userId === userId);
        return r && { id: r.id, url: r.url, host: r.host, state: r.state, lastTestAt: r.lastTestAt };
      },
      claimTestSlot: async (userId, id, now) => {
        const r = rows.find((x) => x.id === id && x.userId === userId);
        if (!r) return false;
        if (r.lastTestAt !== null && r.lastTestAt.getTime() > now.getTime() - 60_000) return false;
        r.lastTestAt = now;
        return true;
      },
      recordTestOutcome: async (userId, id, outcome) => {
        const r = rows.find((x) => x.id === id && x.userId === userId);
        if (r) r.lastTestOutcome = outcome;
      },
    },
  };
  const fakeFetch = vi.fn<SenderFetch>(async () => ({ status: 204 }));
  const h = createWebhookHandlers({ repos: () => repos, newId: () => DELIVERY, fetch: fakeFetch });
  const table: Phase2Route[] = [
    {
      method: "POST",
      pattern: "/api/webhooks/:id/test",
      auth: "session",
      enabled: (f) => f.FEATURE_WEBHOOKS,
      handler: h.testWebhook,
    },
  ];
  const lines: string[] = [];
  const write = (line: string): void => {
    lines.push(line);
  };
  const sink: LogSink = { debug: write, info: write, warn: write, error: write };
  const handler = createFetchHandler([], {
    phase2Routes: table,
    logSink: sink,
    now: () => NOW,
    resolveSession: async (hash): Promise<Session | null> =>
      hash.length > 0 ? { sessionId: "s", userId: USER, email: "a@b.co", tokenHash: hash } : null,
  });
  const send = (id = ID) =>
    handler(
      new Request(`https://api.example.com/api/webhooks/${id}/test`, {
        method: "POST",
        headers: { Origin: ORIGIN, Cookie: "aerobrief_session=tok", "Content-Type": "application/json" },
        body: "{}",
      }),
      env,
    );
  return { send, row, fakeFetch, lines, deliveryWrites };
}

describe("POST /api/webhooks/:id/test", () => {
  it("answers 404 for an unknown or foreign id and sends nothing", async () => {
    const { send, fakeFetch } = setup({ userId: OTHER });
    expect((await send()).status).toBe(404);
    expect((await send("55555555-5555-4555-8555-555555555555")).status).toBe(404);
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("delivers with safe mode off, signs the request and records only last_test_outcome", async () => {
    const { send, fakeFetch, row } = setup();
    const res = await send();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: "delivered", status: 204 });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const [url, init] = fakeFetch.mock.calls[0] ?? [];
    expect(url).toBe(URL_OK);
    expect(init?.headers["X-AeroBrief-Delivery"]).toBe(DELIVERY);
    expect(init?.headers["X-AeroBrief-Timestamp"]).toBe(String(Math.floor(NOW.getTime() / 1000)));
    expect(init?.headers["X-AeroBrief-Signature"]).toBeTruthy();
    expect(JSON.parse(init?.body ?? "{}")).toMatchObject({ id: DELIVERY, type: "TEST" });
    expect(row.lastTestOutcome).toBe("delivered");
    expect(row.consecutiveFailures).toBe(2);
    expect(row.state).toBe("active");
  });

  it("maps a non-2xx status and a network error to failed", async () => {
    const a = setup();
    a.fakeFetch.mockResolvedValueOnce({ status: 500 });
    expect(await (await a.send()).json()).toEqual({ outcome: "failed", status: 500 });
    expect(a.row.lastTestOutcome).toBe("failed");

    const b = setup();
    b.fakeFetch.mockRejectedValueOnce(new Error("boom"));
    expect(await (await b.send()).json()).toEqual({ outcome: "failed", errorKind: "network" });
    expect(b.row.consecutiveFailures).toBe(2);
  });

  it("answers 429 with retryAfterSeconds in 1..60 inside 60 seconds and does not send", async () => {
    const { send, fakeFetch } = setup({ lastTestAt: new Date(NOW.getTime() - 20_000) });
    const res = await send();
    expect(res.status).toBe(429);
    const body = (await res.json()) as { retryAfterSeconds: number };
    expect(body.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(body.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect(res.headers.get("Retry-After")).toBe(String(body.retryAfterSeconds));
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("allows a second test exactly 60 seconds later", async () => {
    const { send } = setup({ lastTestAt: new Date(NOW.getTime() - 60_000) });
    expect((await send()).status).toBe(200);
  });

  it("with safe mode on, refuses a host that is not allowlisted and makes no request", async () => {
    const { send, fakeFetch, row } = setup({}, { ...envOn, SAFE_SEND_MODE: "true" });
    const res = await send();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: "failed", errorKind: "not_allowlisted" });
    expect(fakeFetch).not.toHaveBeenCalled();
    expect(row.lastTestOutcome).toBe("failed");
  });

  it("with safe mode on, sends to an allowlisted host", async () => {
    const { send, fakeFetch } = setup(
      {},
      { ...envOn, SAFE_SEND_MODE: "true", SAFE_SEND_ALLOWLIST_HOSTS: "Hooks.Example.com" },
    );
    expect(await (await send()).json()).toEqual({ outcome: "delivered", status: 204 });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("still sends for a disabled webhook and keeps it disabled", async () => {
    const { send, fakeFetch, row } = setup({ state: "disabled", consecutiveFailures: 5 });
    expect((await send()).status).toBe(200);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect(row.state).toBe("disabled");
    expect(row.consecutiveFailures).toBe(5);
  });

  it("logs only the webhook id, host and outcome", async () => {
    const { send, lines } = setup();
    await send();
    const all = lines.join("\n");
    expect(all).not.toContain("XXXSECRETPATH");
    expect(all).not.toContain(MASTER);
    expect(all).toContain("hooks.example.com");
  });

  it("answers 404 with the flag off", async () => {
    const { send, fakeFetch } = setup({}, { ...baseEnv, WEBHOOK_MASTER_SECRET: MASTER });
    expect((await send()).status).toBe(404);
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("answers 503 when the master secret is missing", async () => {
    const { send, fakeFetch } = setup({}, { ...baseEnv, FEATURE_WEBHOOKS: "true" });
    expect((await send()).status).toBe(503);
    expect(fakeFetch).not.toHaveBeenCalled();
  });
});

describe("signature", () => {
  it("verifies with the secret derived from the master secret and webhook id", async () => {
    const { send, fakeFetch } = setup();
    await send();
    const [, init] = fakeFetch.mock.calls[0] ?? [];
    const secret = await deriveWebhookSecret(MASTER, ID);
    const expected = await signWebhook(
      secret,
      Number(init?.headers["X-AeroBrief-Timestamp"]),
      init?.body ?? "",
    );
    expect(init?.headers["X-AeroBrief-Signature"]).toBe(expected);
  });
});
