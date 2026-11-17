import { createLogger } from "@aerobrief/core";
import type { SendEmailOptions, SendEmailResult } from "@aerobrief/mail";
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { notify, type NotifierEvent, type NotifierRepositories } from "../src/notifier";

// Feature: aerobrief, Property 16: Staleness threshold and send gate
// **Validates: Requirements 6.2, 6.8**

const config = {
  resendApiKey: "re_key",
  unsubscribeSecret: "unsub_secret",
  frontendUrl: "https://app.example.com",
  from: "AeroBrief <alerts@example.com>",
};

const event: NotifierEvent = {
  id: "e1",
  eventKey: "faa:1",
  type: "GROUND_STOP_STARTED",
  airportId: "JFK",
  occurredAt: new Date("2026-03-01T12:00:00.000Z"),
  explanation: "Ground stop at JFK.",
};

/** In-memory fakes: a single stored Snapshot, N eligible watchers, a recording sender. */
function run(elapsedMs: number, watcherCount: number) {
  const now = new Date("2026-03-01T12:30:00.000Z");
  const capturedAt = new Date(now.getTime() - elapsedMs).toISOString();
  const watchers = Array.from({ length: watcherCount }, (_, i) => ({ userId: `u${i}`, email: `u${i}@x.com` }));
  const sent: SendEmailOptions[] = [];
  const repos = {
    snapshots: { latestSnapshot: async () => ({ id: "s", capturedAt, airports: [] }) },
    subscriptions: {
      watchersOfAirport: async () => watchers,
      usersWithWatchlist: async () => watchers,
    },
    alertLog: {
      claim: async (rows: readonly { eventId: string; eventKey: string; eventType: string; userId: string }[]) =>
        rows.map((r) => ({ ...r, id: `claim-${r.userId}` })),
      recordOutcome: async () => undefined,
      recordLatency: async () => undefined,
    },
  } as unknown as NotifierRepositories;
  const sendEmail = async (o: SendEmailOptions): Promise<SendEmailResult> => {
    sent.push(o);
    return { ok: true, id: "r", attempts: 1, idempotencyKey: "k" };
  };
  const noop = () => undefined;
  const logger = createLogger([], { debug: noop, info: noop, warn: noop, error: noop });
  const summary = notify(
    { repos, sendEmail, clock: () => now, logger, config },
    { events: [event], storedAt: now },
  );
  return { summary, sent };
}

const elapsedArb = fc.oneof(
  fc.integer({ min: 0, max: 7_200_000 }),
  fc.integer({ min: 599_995, max: 600_005 }),
);

describe("Property 16: Notifier send gate", () => {
  test("Resend is called zero times iff elapsed > 600 s, given at least one eligible recipient", async () => {
    await fc.assert(
      fc.asyncProperty(elapsedArb, fc.integer({ min: 1, max: 5 }), async (elapsed, watcherCount) => {
        const { summary, sent } = run(elapsed, watcherCount);
        const result = await summary;
        if (elapsed > 600_000) {
          expect(sent).toHaveLength(0);
          expect(result.skippedStale).toBe(true);
        } else {
          expect(sent).toHaveLength(watcherCount);
          expect(result.skippedStale).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });
});
