import { applyOutcome, createLogger, type WebhookCounterState } from "@aerobrief/core";
import type { SenderFetch } from "@aerobrief/webhook-sender";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import { notify, type NotifierRepositories } from "../src/notifier";
import { dispatchWebhooks, NOT_ALLOWLISTED, type WebhookEvent, type WebhookRepositories } from "../src/webhooks";

const NOW = new Date("2025-01-02T12:00:00.000Z");
const MASTER = "m".repeat(40);
const SECRET_PATH = "/hooks/very-secret-path-token";

const baseEnv = {
  DATABASE_URL: "postgres://user:dbpass@db.example.com/app",
  RESEND_API_KEY: "re_secret_value",
  UNSUBSCRIBE_SECRET: "unsub_secret_value",
  FRONTEND_URL: "https://app.example.com",
  MAIL_FROM: "AeroBrief <alerts@example.com>",
  FEATURE_WEBHOOKS: "true",
  WEBHOOK_MASTER_SECRET: MASTER,
  SAFE_SEND_MODE: "false",
} satisfies Env;

const makeEvent = (n: number, type: WebhookEvent["type"] = "GROUND_STOP_STARTED"): WebhookEvent => ({
  id: `e${n}`,
  eventKey: `faa:${n}`,
  type,
  airportId: type === "NATIONWIDE_EVENT" ? null : "JFK",
  occurredAt: NOW,
  explanation: "Ground stop at JFK.",
  payload:
    type === "NATIONWIDE_EVENT"
      ? { type, occurredAt: NOW.toISOString(), count: 3, affectedArtccs: ["ZNY", "ZBW", "ZDC"] }
      : { type, airportId: "JFK", occurredAt: NOW.toISOString(), faaEventId: `faa:${n}`, reason: "VOL" },
});

type Hook = { id: string; userId: string; url: string; host: string; state: "active" | "disabled" };

function setup(
  opts: {
    capturedAt?: string | null;
    watchers?: { userId: string; email: string }[];
    hooks?: Hook[];
    status?: number | (() => number);
    existingClaims?: string[];
    activeThrows?: boolean;
  } = {},
) {
  const lines: string[] = [];
  const push = (l: string) => void lines.push(l);
  const logger = createLogger([MASTER], { debug: push, info: push, warn: push, error: push });
  const hooks = opts.hooks ?? [
    { id: "w1", userId: "u1", url: `https://hooks.example.com${SECRET_PATH}`, host: "hooks.example.com", state: "active" as const },
  ];
  const counters = new Map<string, WebhookCounterState>(hooks.map((h) => [h.id, { failures: 0, disabled: false }]));
  const claimed = new Set<string>(opts.existingClaims ?? []);
  const watchers = opts.watchers ?? [{ userId: "u1", email: "u1@example.com" }];

  const repos = {
    snapshots: {
      latestSnapshot: vi.fn(async () =>
        opts.capturedAt === null ? null : { id: "s", capturedAt: opts.capturedAt ?? NOW.toISOString(), airports: [] },
      ),
    },
    subscriptions: {
      watchersOfAirport: vi.fn(async () => watchers),
      usersWithWatchlist: vi.fn(async () => watchers),
    },
    webhooks: {
      activeForSender: vi.fn(async (userIds: readonly string[]) => {
        if (opts.activeThrows) throw new Error("db down");
        return hooks.filter((h) => userIds.includes(h.userId) && !counters.get(h.id)?.disabled);
      }),
      claimDelivery: vi.fn(async (i: { webhookId: string; eventKey: string; eventType: string }) => {
        const k = JSON.stringify([i.webhookId, i.eventKey, i.eventType]);
        if (claimed.has(k)) return false;
        claimed.add(k);
        return true;
      }),
      completeDelivery: vi.fn(async (_id: string, _r: unknown, _now: Date) => undefined),
      recordOutcome: vi.fn(async (id: string, outcome: "delivered" | "failed" | "skipped", _now: Date) => {
        counters.set(id, applyOutcome(counters.get(id) as WebhookCounterState, outcome));
      }),
    },
  };

  const calls: { url: string; at: number; headers: Record<string, string> }[] = [];
  const fetchFn: SenderFetch = vi.fn(async (url, init) => {
    calls.push({ url, at: Date.now(), headers: init.headers });
    const s = typeof opts.status === "function" ? opts.status() : (opts.status ?? 200);
    return { status: s };
  });

  const run = (events: WebhookEvent[], env: Env = baseEnv, extra: { sleep?: (ms: number) => Promise<void> } = {}) =>
    dispatchWebhooks(env, events, NOW, {
      createRepositories: () => repos as unknown as WebhookRepositories,
      fetchFn,
      logger,
      clock: () => new Date(vi.isFakeTimers() ? Date.now() : NOW.getTime()),
      ...extra,
    });
  return { repos, fetchFn, calls, lines, counters, run, logger };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("dispatchWebhooks gates", () => {
  it("does nothing with the flag off: no repositories, no queries, no fetch", async () => {
    const s = setup();
    const factory = vi.fn(() => s.repos as unknown as WebhookRepositories);
    const out = await dispatchWebhooks({ ...baseEnv, FEATURE_WEBHOOKS: "false" }, [makeEvent(1)], NOW, {
      createRepositories: factory,
      fetchFn: s.fetchFn,
      logger: s.logger,
    });
    expect(out.skippedReason).toBe("flag_off");
    expect(factory).not.toHaveBeenCalled();
    expect(s.fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    ["stale", new Date(NOW.getTime() - 600_001).toISOString()],
    ["missing", null],
  ])("sends nothing when the latest snapshot is %s", async (_label, capturedAt) => {
    const s = setup({ capturedAt });
    const out = await s.run([makeEvent(1)]);
    expect(out.skippedReason).toBe("stale_snapshot");
    expect(s.repos.webhooks.activeForSender).not.toHaveBeenCalled();
    expect(s.repos.webhooks.claimDelivery).not.toHaveBeenCalled();
    expect(s.fetchFn).not.toHaveBeenCalled();
  });

  it.each([["missing", undefined], ["short", "x".repeat(31)]])(
    "sends nothing and logs one error when the master secret is %s",
    async (_label, secret) => {
      const s = setup();
      const env = { ...baseEnv, WEBHOOK_MASTER_SECRET: secret } as Env;
      const out = await s.run([makeEvent(1)], env);
      expect(out.skippedReason).toBe("no_master_secret");
      expect(s.lines.filter((l) => l.includes('"level":"error"'))).toHaveLength(1);
      expect(s.repos.snapshots.latestSnapshot).not.toHaveBeenCalled();
      expect(s.fetchFn).not.toHaveBeenCalled();
    },
  );

  it("records skipped with not_allowlisted under Safe_Send_Mode and sends nothing", async () => {
    const s = setup();
    const out = await s.run([makeEvent(1)], { ...baseEnv, SAFE_SEND_MODE: "true", SAFE_SEND_ALLOWLIST_HOSTS: "other.example.com" });
    expect(out.skipped).toBe(1);
    expect(s.fetchFn).not.toHaveBeenCalled();
    expect(s.repos.webhooks.completeDelivery).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ outcome: "skipped", lastErrorKind: NOT_ALLOWLISTED }),
      expect.any(Date),
    );
    expect(s.counters.get("w1")).toEqual({ failures: 0, disabled: false });
  });
});

describe("dispatchWebhooks delivery", () => {
  it("selects the same recipients as alert emails", async () => {
    const watchers = [
      { userId: "u1", email: "u1@example.com" },
      { userId: "u2", email: "u2@example.com" },
    ];
    const s = setup({ watchers });
    const emailClaims: string[] = [];
    const notifierRepos = {
      snapshots: s.repos.snapshots,
      subscriptions: s.repos.subscriptions,
      alertLog: {
        claim: vi.fn(async (rows: readonly { userId: string; eventKey: string; eventType: string; eventId: string }[]) => {
          emailClaims.push(...rows.map((r) => r.userId));
          return rows.map((r) => ({ ...r, id: `c-${r.userId}` }));
        }),
        recordOutcome: vi.fn(async () => undefined),
        recordLatency: vi.fn(async () => undefined),
      },
    };
    const event = makeEvent(1);
    await notify(
      {
        repos: notifierRepos as unknown as NotifierRepositories,
        sendEmail: vi.fn(async () => ({ ok: true as const, id: "r", attempts: 1, idempotencyKey: "k" })),
        clock: () => NOW,
        logger: s.logger,
        config: { resendApiKey: "k", unsubscribeSecret: "u", frontendUrl: "https://app.example.com", from: "a@b.c" },
      },
      { events: [event], storedAt: NOW },
    );
    await s.run([event]);
    const [userIds] = s.repos.webhooks.activeForSender.mock.calls[0] as [string[]];
    expect([...userIds].sort()).toEqual([...emailClaims].sort());
  });

  it("retries with 2 s and 8 s waits and keeps one Delivery_ID", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["setTimeout", "clearTimeout", "Date"] });
    const s = setup({ status: 503 });
    const waits: number[] = [];
    const done = s.run([makeEvent(1)], baseEnv, {
      sleep: (ms) => {
        waits.push(ms);
        return new Promise((r) => setTimeout(r, ms));
      },
    });
    // Signing uses real async crypto, so yield to real I/O until each wait is pending, then advance it.
    for (let i = 0; i < 2; i++) {
      while (vi.getTimerCount() === 0) await new Promise<void>((r) => setImmediate(r));
      await vi.advanceTimersByTimeAsync(waits[i] as number);
    }
    const out = await done;
    expect(waits).toEqual([2000, 8000]);
    expect(s.calls.map((c) => c.at - NOW.getTime())).toEqual([0, 2000, 10_000]);
    expect(new Set(s.calls.map((c) => c.headers["X-AeroBrief-Delivery"])).size).toBe(1);
    expect(out.failed).toBe(1);
    expect(s.repos.webhooks.completeDelivery).toHaveBeenCalledWith(
      s.calls[0]?.headers["X-AeroBrief-Delivery"],
      expect.objectContaining({ outcome: "failed", attempts: 3, lastStatus: 503 }),
      expect.any(Date),
    );
  });

  it("does not retry a 4xx and logs only ids, host, outcome and counts", async () => {
    const s = setup({ status: 404 });
    await s.run([makeEvent(1)]);
    expect(s.calls).toHaveLength(1);
    const text = s.lines.join("\n");
    expect(text).toContain("hooks.example.com");
    expect(text).not.toContain(SECRET_PATH);
    expect(text).not.toContain(MASTER);
    expect(text).not.toContain("whsec_");
  });

  it("does not send twice for an already claimed delivery", async () => {
    const s = setup({ existingClaims: [JSON.stringify(["w1", "faa:1", "GROUND_STOP_STARTED"])] });
    await s.run([makeEvent(1)]);
    expect(s.fetchFn).not.toHaveBeenCalled();
  });

  it("disables a webhook after 5 consecutive failures, sends it nothing more, and emails nobody", async () => {
    const s = setup({ status: 400 });
    for (let n = 1; n <= 5; n++) await s.run([makeEvent(n)]);
    expect(s.counters.get("w1")).toEqual({ failures: 5, disabled: true });
    expect(s.calls).toHaveLength(5);
    await s.run([makeEvent(6)]);
    expect(s.calls).toHaveLength(5);
    // Only the webhook host is ever contacted; no mail API is called.
    expect(s.calls.every((c) => new URL(c.url).host === "hooks.example.com")).toBe(true);
  });

  it("resets the counter on a delivered outcome", async () => {
    let n = 0;
    const s = setup({ status: () => (++n <= 2 ? 400 : 200) });
    for (let i = 1; i <= 3; i++) await s.run([makeEvent(i)]);
    expect(s.counters.get("w1")).toEqual({ failures: 0, disabled: false });
  });
});

describe("dispatchWebhooks failure isolation", () => {
  it("catches a throw and leaves alert emails unchanged", async () => {
    const s = setup({ activeThrows: true });
    const sendEmail = vi.fn(async () => ({ ok: true as const, id: "r", attempts: 1, idempotencyKey: "k" }));
    const alertLog = {
      claim: vi.fn(async (rows: readonly { userId: string; eventKey: string; eventType: string; eventId: string }[]) =>
        rows.map((r) => ({ ...r, id: `c-${r.userId}` })),
      ),
      recordOutcome: vi.fn(async () => undefined),
      recordLatency: vi.fn(async () => undefined),
    };
    const event = makeEvent(1);
    await notify(
      {
        repos: { snapshots: s.repos.snapshots, subscriptions: s.repos.subscriptions, alertLog } as unknown as NotifierRepositories,
        sendEmail,
        clock: () => NOW,
        logger: s.logger,
        config: { resendApiKey: "k", unsubscribeSecret: "u", frontendUrl: "https://app.example.com", from: "a@b.c" },
      },
      { events: [event], storedAt: NOW },
    );
    const before = {
      sends: sendEmail.mock.calls.length,
      claims: alertLog.claim.mock.calls.length,
      outcomes: alertLog.recordOutcome.mock.calls.length,
    };
    await expect(s.run([event])).resolves.toMatchObject({ claimed: 0 });
    expect(s.lines.some((l) => l.includes("webhook_dispatch_failed"))).toBe(true);
    expect({
      sends: sendEmail.mock.calls.length,
      claims: alertLog.claim.mock.calls.length,
      outcomes: alertLog.recordOutcome.mock.calls.length,
    }).toEqual(before);
    expect(before.sends).toBe(1);
  });
});
