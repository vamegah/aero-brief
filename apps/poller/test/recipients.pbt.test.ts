import { createLogger, MONITORED_IDS } from "@aerobrief/core";
import type { SendEmailOptions, SendEmailResult } from "@aerobrief/mail";
import fc from "fast-check";
import { describe, it } from "vitest";
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
  .uniqueArray(fc.integer({ min: 0, max: 40 }), { minLength: 0, maxLength: 15 })
  .chain((ids) =>
    fc.tuple(
      ...ids.map((n) =>
        fc
          .uniqueArray(airportArb, { minLength: 0, maxLength: 10 })
          .map((watchlist): User => ({ userId: `u${n}`, email: `u${n}@x.com`, watchlist })),
      ),
    ),
  );

/** Runs notify against an in-memory subscription store; returns the emails that were sent. */
async function recipientsFor(users: readonly User[], event: NotifierEvent): Promise<string[]> {
  const sent: string[] = [];
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
      claim: async (rows: readonly { eventId: string; eventKey: string; eventType: string; userId: string }[]) =>
        rows.map((r) => ({ ...r, id: `claim-${r.eventKey}-${r.userId}` })),
      recordOutcome: async () => undefined,
      recordLatency: async () => undefined,
    },
  };
  const sendEmail = async (opts: SendEmailOptions): Promise<SendEmailResult> => {
    sent.push(opts.message.to as string);
    return { ok: true, id: "r", attempts: 1, idempotencyKey: "k" };
  };
  const logger = createLogger([], { debug: noop, info: noop, warn: noop, error: noop });
  let tick = 0;
  await notify(
    {
      repos: repos as unknown as NotifierRepositories,
      sendEmail,
      clock: () => new Date(storedAt.getTime() + 1000 + 10 * tick++),
      logger,
      config,
    },
    { events: [event], storedAt },
  );
  return sent;
}

const sortedUnique = (xs: string[]) => [...new Set(xs)].sort();

describe("Feature: aerobrief, Property 24: Alert recipient selection", () => {
  // **Validates: Requirements 9.1, 9.4, 9.6, 9.7**
  it("ground stop alerts go to exactly the users watching the airport, once each", async () => {
    await fc.assert(
      fc.asyncProperty(
        usersArb,
        airportArb,
        fc.constantFrom("GROUND_STOP_STARTED", "GROUND_STOP_ENDED"),
        async (users, airportId, type) => {
          const event: NotifierEvent = {
            id: "e1",
            eventKey: `faa:${airportId}`,
            type,
            airportId,
            occurredAt: storedAt,
            explanation: "Ground stop.",
          };
          const sent = await recipientsFor(users, event);
          const expected = users.filter((u) => u.watchlist.includes(airportId)).map((u) => u.email).sort();
          return sent.length === new Set(sent).size && JSON.stringify([...sent].sort()) === JSON.stringify(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("nationwide alerts go to exactly the users with a non-empty watchlist, never to empty ones", async () => {
    await fc.assert(
      fc.asyncProperty(usersArb, async (users) => {
        const event: NotifierEvent = {
          id: "e2",
          eventKey: "NATIONWIDE:none",
          type: "NATIONWIDE_EVENT",
          airportId: null,
          occurredAt: storedAt,
          explanation: "System-wide.",
        };
        const sent = await recipientsFor(users, event);
        const expected = users.filter((u) => u.watchlist.length > 0).map((u) => u.email).sort();
        return sent.length === sortedUnique(sent).length && JSON.stringify([...sent].sort()) === JSON.stringify(expected);
      }),
      { numRuns: 100 },
    );
  });
});
