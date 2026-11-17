import { createLogger, MONITORED_IDS } from "@aerobrief/core";
import type { SendEmailOptions, SendEmailResult } from "@aerobrief/mail";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { notify, type NotifierEvent, type NotifierRepositories } from "../src/notifier";

const storedAt = new Date("2025-01-02T12:00:00.000Z");
const config = {
  resendApiKey: "re_secret_value",
  unsubscribeSecret: "unsub_secret_value",
  frontendUrl: "https://app.example.com",
  from: "AeroBrief <alerts@example.com>",
};

type User = { userId: string; email: string; watchlist: string[] };

const airportArb = fc.constantFrom(...MONITORED_IDS);
const usersArb = fc
  .uniqueArray(fc.integer({ min: 0, max: 30 }), { minLength: 0, maxLength: 10 })
  .chain((ids) =>
    fc.tuple(
      ...ids.map((n) =>
        fc
          .uniqueArray(airportArb, { minLength: 0, maxLength: 8 })
          .map((watchlist): User => ({ userId: `u${n}`, email: `u${n}@x.com`, watchlist })),
      ),
    ),
  );

const eventsArb = fc
  .uniqueArray(
    fc.record({
      n: fc.integer({ min: 0, max: 20 }),
      type: fc.constantFrom("GROUND_STOP_STARTED", "GROUND_STOP_ENDED", "NATIONWIDE_EVENT"),
      airportId: airportArb,
    }),
    { minLength: 0, maxLength: 8, selector: (e) => `${e.n}|${e.type}` },
  )
  .map((specs): NotifierEvent[] =>
    specs.map((s) => ({
      id: `e-${s.n}-${s.type}`,
      eventKey: `faa:${s.n}`,
      type: s.type,
      airportId: s.type === "NATIONWIDE_EVENT" ? null : s.airportId,
      occurredAt: storedAt,
      explanation: "Event.",
    })),
  );

// Feature: aerobrief, Property 27: Reprocessing events sends at most one email per user per event
describe("Property 27: Reprocessing events sends at most one email per user per event", () => {
  // **Validates: Requirements 9.9, 9.10**
  it("running the Notifier repeatedly over the same Events sends each (user, Event) at most once", async () => {
    await fc.assert(
      fc.asyncProperty(usersArb, eventsArb, fc.integer({ min: 2, max: 4 }), async (users, events, runs) => {
        // In-memory alert_log enforcing unique(event_key, event_type, user_id).
        const claimed = new Set<string>();
        const sends: string[] = [];
        const noop = () => undefined;
        const repos = {
          snapshots: {
            latestSnapshot: async () => ({ id: "s", capturedAt: storedAt.toISOString(), airports: [] }),
          },
          subscriptions: {
            watchersOfAirport: async (airportId: string) =>
              users
                .filter((u) => u.watchlist.includes(airportId))
                .map((u) => ({ userId: u.userId, email: u.email })),
            usersWithWatchlist: async () =>
              users.filter((u) => u.watchlist.length > 0).map((u) => ({ userId: u.userId, email: u.email })),
          },
          alertLog: {
            claim: async (
              rows: readonly { eventId: string; eventKey: string; eventType: string; userId: string }[],
            ) => {
              const inserted: unknown[] = [];
              for (const r of rows) {
                const key = JSON.stringify([r.eventKey, r.eventType, r.userId]);
                if (claimed.has(key)) continue;
                claimed.add(key);
                inserted.push({ ...r, id: `claim-${key}` });
              }
              return inserted;
            },
            recordOutcome: async () => undefined,
            recordLatency: async () => undefined,
          },
        };
        const sendEmail = async (opts: SendEmailOptions): Promise<SendEmailResult> => {
          const { eventKey, eventType, userId } = opts.idempotency;
          sends.push(JSON.stringify([eventKey, eventType, userId]));
          return { ok: true, id: "r", attempts: 1, idempotencyKey: "k" };
        };
        const logger = createLogger([], { debug: noop, info: noop, warn: noop, error: noop });
        let tick = 0;
        const deps = {
          repos: repos as unknown as NotifierRepositories,
          sendEmail,
          clock: () => new Date(storedAt.getTime() + 1000 + 10 * tick++),
          logger,
          config,
        };

        const afterFirst: number[] = [];
        for (let i = 0; i < runs; i++) {
          await notify(deps, { events, storedAt });
          afterFirst.push(sends.length);
        }

        expect(sends.length).toBe(new Set(sends).size);
        // Reprocessing sends nothing new.
        expect(afterFirst[afterFirst.length - 1]).toBe(afterFirst[0]);
      }),
      { numRuns: 100 },
    );
  });
});
