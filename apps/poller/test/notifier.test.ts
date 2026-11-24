import { createLogger, explain } from "@aerobrief/core";
import { idempotencyKey, sendEmail as realSendEmail } from "@aerobrief/mail";
import type { SendEmailOptions, SendEmailResult } from "@aerobrief/mail";
import type { Repositories } from "@aerobrief/db";
import { describe, expect, it, vi } from "vitest";
import {
  notify,
  STALE_ABORT_ERROR,
  type NotifierEvent,
  type NotifierRepositories,
} from "../src/notifier";

const storedAt = new Date("2025-01-02T12:00:00.000Z");
const SECRET = "unsub_secret_value";
const config = {
  resendApiKey: "re_secret_value",
  unsubscribeSecret: SECRET,
  frontendUrl: "https://app.example.com",
  from: "AeroBrief <alerts@example.com>",
};

const gsEvent: NotifierEvent = {
  id: "e1",
  eventKey: "faa:1",
  type: "GROUND_STOP_STARTED",
  airportId: "JFK",
  occurredAt: storedAt,
  explanation: "Ground stop at JFK.",
};
const nwEvent: NotifierEvent = {
  id: "e2",
  eventKey: "NATIONWIDE:none",
  type: "NATIONWIDE_EVENT",
  airportId: null,
  occurredAt: storedAt,
  explanation: "System-wide.",
};

function setup(
  opts: {
    capturedAt?: string | null;
    watchers?: { userId: string; email: string }[];
    withWatchlist?: { userId: string; email: string }[];
    existingClaims?: string[]; // userIds already claimed
    send?: (o: SendEmailOptions) => Promise<SendEmailResult>;
    latencyFails?: boolean;
    now?: () => Date;
  } = {},
) {
  const lines: string[] = [];
  const push = (l: string) => void lines.push(l);
  const logger = createLogger([config.resendApiKey, SECRET], { debug: push, info: push, warn: push, error: push });
  const repos = {
    snapshots: {
      latestSnapshot: vi.fn(async () =>
        opts.capturedAt === null
          ? null
          : { id: "s", capturedAt: opts.capturedAt ?? storedAt.toISOString(), airports: [] },
      ),
    },
    subscriptions: {
      watchersOfAirport: vi.fn(async () => opts.watchers ?? []),
      usersWithWatchlist: vi.fn(async () => opts.withWatchlist ?? []),
    },
    alertLog: {
      claim: vi.fn(async (rows: readonly { eventId: string; eventKey: string; eventType: string; userId: string }[]) =>
        rows
          .filter((r) => !(opts.existingClaims ?? []).includes(r.userId))
          .map((r) => ({ ...r, id: `claim-${r.eventKey}-${r.userId}` })),
      ),
      recordOutcome: vi.fn(async (_id: string, _outcome: Parameters<Repositories["alertLog"]["recordOutcome"]>[1]) => undefined),
      recordLatency: vi.fn(async (_id: string, _latencyMs: number) => {
        if (opts.latencyFails) throw new Error("db down");
      }),
    },
  };
  const sendEmail = vi.fn(
    opts.send ?? (async (): Promise<SendEmailResult> => ({ ok: true, id: "r1", attempts: 1, idempotencyKey: "k" })),
  );
  let tick = 0;
  const clock = opts.now ?? (() => new Date(storedAt.getTime() + 1000 + 500 * tick++));
  const run = (events: NotifierEvent[]) =>
    notify(
      { repos: repos as unknown as NotifierRepositories, sendEmail, clock, logger, config },
      { events, storedAt },
    );
  return { repos, sendEmail, lines, run };
}

describe("notify", () => {
  it("sends to watchers of a ground stop airport and records handed_off with latency", async () => {
    const t = setup({ watchers: [{ userId: "u1", email: "a@x.com" }] });
    const summary = await t.run([gsEvent]);
    expect(summary).toMatchObject({ claimed: 1, handedOff: 1, failed: 0 });
    expect(t.sendEmail).toHaveBeenCalledTimes(1);
    const arg = t.sendEmail.mock.calls[0]![0];
    expect(arg.message.to).toBe("a@x.com");
    expect(arg.message.text).toContain("sig=");
    expect(arg.idempotency).toEqual({ eventKey: "faa:1", eventType: "GROUND_STOP_STARTED", userId: "u1" });
    expect(t.repos.alertLog.recordOutcome).toHaveBeenCalledWith(
      "claim-faa:1-u1",
      expect.objectContaining({ status: "handed_off", attempts: 1 }),
    );
    const latency = t.repos.alertLog.recordLatency.mock.calls[0]![1];
    expect(latency).toBeGreaterThan(0);
  });

  it("sends a ground stop alert for a New_Airport (LGA) with the registry name and no raw FAA code", async () => {
    const explanation = explain({
      type: "GROUND_STOP_STARTED",
      airportId: "LGA",
      occurredAt: storedAt.toISOString(),
      faaEventId: "faa:lga",
      reason: "VOL",
    });
    const lgaEvent: NotifierEvent = {
      id: "e-lga",
      eventKey: "faa:lga",
      type: "GROUND_STOP_STARTED",
      airportId: "LGA",
      occurredAt: storedAt,
      explanation,
    };
    const t = setup({ watchers: [{ userId: "u1", email: "a@x.com" }] });
    const summary = await t.run([lgaEvent]);
    expect(summary).toMatchObject({ claimed: 1, handedOff: 1, failed: 0 });
    expect(t.repos.subscriptions.watchersOfAirport).toHaveBeenCalledWith("LGA");
    const { message } = t.sendEmail.mock.calls[0]![0];
    expect(message.to).toBe("a@x.com");
    for (const part of [message.subject, message.text]) expect(part).toContain("New York LaGuardia");
    expect(message.text).toContain(explanation);
    expect(explanation).toContain("A ground stop is in effect at New York LaGuardia (LGA).");
    expect(explanation).not.toContain("VOL");
    expect(message.text).not.toContain("VOL");
  });

  it("sends nationwide events only to users with a watchlist and no unsubscribe link", async () => {
    const t = setup({ withWatchlist: [{ userId: "u2", email: "b@x.com" }] });
    await t.run([nwEvent]);
    expect(t.repos.subscriptions.watchersOfAirport).not.toHaveBeenCalled();
    expect(t.sendEmail).toHaveBeenCalledTimes(1);
    expect(t.sendEmail.mock.calls[0]![0].message.text).not.toContain("unsubscribe");
  });

  it("sends nothing and claims nothing when the latest Snapshot is stale", async () => {
    const t = setup({
      capturedAt: new Date(storedAt.getTime() - 601_000).toISOString(),
      watchers: [{ userId: "u1", email: "a@x.com" }],
      now: () => storedAt,
    });
    const summary = await t.run([gsEvent]);
    expect(summary.skippedStale).toBe(true);
    expect(t.repos.alertLog.claim).not.toHaveBeenCalled();
    expect(t.sendEmail).not.toHaveBeenCalled();
  });

  it("sends nothing when no Snapshot exists", async () => {
    const t = setup({ capturedAt: null, watchers: [{ userId: "u1", email: "a@x.com" }] });
    expect((await t.run([gsEvent])).skippedStale).toBe(true);
    expect(t.sendEmail).not.toHaveBeenCalled();
  });

  it("sends only to newly claimed rows", async () => {
    const t = setup({
      watchers: [
        { userId: "u1", email: "a@x.com" },
        { userId: "u2", email: "b@x.com" },
      ],
      existingClaims: ["u1"],
    });
    const summary = await t.run([gsEvent]);
    expect(summary.claimed).toBe(1);
    expect(t.sendEmail).toHaveBeenCalledTimes(1);
    expect(t.sendEmail.mock.calls[0]![0].message.to).toBe("b@x.com");
    expect(t.repos.alertLog.claim).toHaveBeenCalledTimes(1);
  });

  it("records failed once when sending fails, without latency", async () => {
    const t = setup({
      watchers: [{ userId: "u1", email: "a@x.com" }],
      send: async () => ({ ok: false, attempts: 3, idempotencyKey: "k", status: 500, error: "http_status:500" }),
    });
    const summary = await t.run([gsEvent]);
    expect(summary).toMatchObject({ handedOff: 0, failed: 1 });
    expect(t.repos.alertLog.recordOutcome).toHaveBeenCalledTimes(1);
    expect(t.repos.alertLog.recordOutcome).toHaveBeenCalledWith(
      "claim-faa:1-u1",
      expect.objectContaining({ status: "failed", attempts: 3, error: "http_status:500" }),
    );
    expect(t.repos.alertLog.recordLatency).not.toHaveBeenCalled();
  });

  it("re-checks staleness in shouldRetry and aborts the retry when data went stale", async () => {
    let later = false;
    const t = setup({
      watchers: [{ userId: "u1", email: "a@x.com" }],
      send: async (o) => {
        later = true; // 11 minutes pass during the first attempt
        const allowed = await o.shouldRetry?.();
        return { ok: false, attempts: allowed ? 2 : 1, idempotencyKey: "k", status: 500, error: "http_status:500" };
      },
      now: () => (later ? new Date(storedAt.getTime() + 11 * 60_000) : storedAt),
    });
    const summary = await t.run([gsEvent]);
    expect(summary.failed).toBe(1);
    expect(t.repos.alertLog.recordOutcome).toHaveBeenCalledWith(
      "claim-faa:1-u1",
      expect.objectContaining({ status: "failed", error: STALE_ABORT_ERROR }),
    );
  });

  it("keeps the email result and logs latency_record_failed when the latency write fails", async () => {
    const t = setup({ watchers: [{ userId: "u1", email: "a@x.com" }], latencyFails: true });
    const summary = await t.run([gsEvent]);
    expect(summary.handedOff).toBe(1);
    const line = t.lines.find((l) => l.includes("latency_record_failed"));
    expect(line).toBeDefined();
    expect(JSON.parse(line!)).toMatchObject({ level: "error", msg: "latency_record_failed" });
    expect(t.lines.join("\n")).not.toContain(SECRET);
    expect(t.lines.join("\n")).not.toContain(config.resendApiKey);
  });

  it("uses one identical Idempotency-Key across attempts and across runs for the same triple", async () => {
    const keys: string[] = [];
    const makeSend = (failFirst: boolean) => {
      let calls = 0;
      return (o: SendEmailOptions) =>
        realSendEmail({
          ...o,
          sleep: async () => undefined,
          fetch: async (_url, init) => {
            keys.push((init?.headers as Record<string, string>)["Idempotency-Key"]!);
            calls++;
            return failFirst && calls === 1
              ? new Response("{}", { status: 500 })
              : new Response(JSON.stringify({ id: "r" }), { status: 200 });
          },
        });
    };
    const watchers = [{ userId: "u1", email: "a@x.com" }];
    await setup({ watchers, send: makeSend(true) }).run([gsEvent]);
    await setup({ watchers, send: makeSend(false) }).run([gsEvent]);
    expect(keys).toHaveLength(3); // run 1: two attempts, run 2: one attempt
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe(await idempotencyKey({ eventKey: "faa:1", eventType: "GROUND_STOP_STARTED", userId: "u1" }));
  });

  it("inserts no Event and sends no email when a retried poll re-detects an existing event", async () => {
    // Re-detected FAA_Event_ID: the Event insert returns nothing new, so the notifier gets no events.
    const none = setup({ watchers: [{ userId: "u1", email: "a@x.com" }] });
    const summary = await none.run([]);
    expect(summary).toEqual({ skippedStale: false, claimed: 0, handedOff: 0, failed: 0 });
    expect(none.repos.alertLog.claim).not.toHaveBeenCalled();
    expect(none.sendEmail).not.toHaveBeenCalled();

    // Even if the same event reached the notifier again, existing claims block any second send.
    const again = setup({ watchers: [{ userId: "u1", email: "a@x.com" }], existingClaims: ["u1"] });
    expect((await again.run([gsEvent])).claimed).toBe(0);
    expect(again.sendEmail).not.toHaveBeenCalled();
  });

  it("sends two emails for STARTED then ENDED of the same FAA_Event_ID", async () => {
    const ended: NotifierEvent = { ...gsEvent, id: "e3", type: "GROUND_STOP_ENDED" };
    const t = setup({ watchers: [{ userId: "u1", email: "a@x.com" }] });
    const summary = await t.run([gsEvent, ended]);
    expect(summary).toMatchObject({ claimed: 2, handedOff: 2, failed: 0 });
    expect(t.sendEmail).toHaveBeenCalledTimes(2);
    const types = t.sendEmail.mock.calls.map((c) => c[0].idempotency.eventType).sort();
    expect(types).toEqual(["GROUND_STOP_ENDED", "GROUND_STOP_STARTED"]);
    expect(new Set(t.sendEmail.mock.calls.map((c) => c[0].idempotency.eventKey))).toEqual(new Set(["faa:1"]));
  });

  it("limits concurrent sends to 10", async () => {
    let active = 0;
    let peak = 0;
    const watchers = Array.from({ length: 25 }, (_, i) => ({ userId: `u${i}`, email: `u${i}@x.com` }));
    const t = setup({
      watchers,
      send: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return { ok: true, id: null, attempts: 1, idempotencyKey: "k" };
      },
    });
    const summary = await t.run([gsEvent]);
    expect(summary.handedOff).toBe(25);
    expect(peak).toBeLessThanOrEqual(10);
    expect(peak).toBeGreaterThan(1);
  });
});
