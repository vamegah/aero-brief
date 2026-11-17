import { createLogger } from "@aerobrief/core";
import { sendEmail, type SendEmailOptions } from "@aerobrief/mail";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { notify, type NotifierEvent, type NotifierRepositories } from "../src/notifier";

// Feature: aerobrief, Property 25: Retry bound and final outcome
// **Validates: Requirements 9.5**

const storedAt = new Date("2025-01-02T12:00:00.000Z");
const config = {
  resendApiKey: "re_secret_value",
  unsubscribeSecret: "unsub_secret_value",
  frontendUrl: "https://app.example.com",
  from: "AeroBrief <alerts@example.com>",
};
const event: NotifierEvent = {
  id: "e1",
  eventKey: "faa:1",
  type: "GROUND_STOP_STARTED",
  airportId: "JFK",
  occurredAt: storedAt,
  explanation: "Ground stop at JFK.",
};

describe("Property 25: Notifier records one final outcome per (event, user)", () => {
  it("records exactly one outcome per claim, handed_off iff k < 3", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 6 }), { minLength: 1, maxLength: 6 }),
        async (ks) => {
          const users = ks.map((k, i) => ({ userId: `u${i}`, email: `u${i}@x.com`, k }));
          const failuresByEmail = new Map(users.map((u) => [u.email, u.k]));
          const calls = new Map<string, number>();
          const fetchFake = async (_url: string, init?: RequestInit): Promise<Response> => {
            const to = (JSON.parse(String(init?.body)) as { to: string }).to;
            const n = calls.get(to) ?? 0;
            calls.set(to, n + 1);
            if (n < failuresByEmail.get(to)!) return new Response("{}", { status: 503 });
            return new Response(JSON.stringify({ id: "m" }), { status: 200 });
          };

          const outcomes = new Map<string, { status: string; attempts: number }[]>();
          const noop = () => undefined;
          const repos = {
            snapshots: {
              latestSnapshot: async () => ({ id: "s", capturedAt: storedAt.toISOString(), airports: [] }),
            },
            subscriptions: {
              watchersOfAirport: async () => users.map(({ userId, email }) => ({ userId, email })),
              usersWithWatchlist: async () => [],
            },
            alertLog: {
              claim: async (rows: readonly { eventId: string; eventKey: string; eventType: string; userId: string }[]) =>
                rows.map((r) => ({ ...r, id: `claim-${r.userId}` })),
              recordOutcome: async (id: string, o: { status: string; attempts: number }) => {
                outcomes.set(id, [...(outcomes.get(id) ?? []), o]);
              },
              recordLatency: async () => undefined,
            },
          };

          const summary = await notify(
            {
              repos: repos as unknown as NotifierRepositories,
              sendEmail: (o: SendEmailOptions) => sendEmail({ ...o, fetch: fetchFake, sleep: async () => undefined }),
              clock: () => new Date(storedAt.getTime() + 1000),
              logger: createLogger([config.resendApiKey], { debug: noop, info: noop, warn: noop, error: noop }),
              config,
            },
            { events: [event], storedAt },
          );

          expect(outcomes.size).toBe(users.length);
          for (const u of users) {
            const recorded = outcomes.get(`claim-${u.userId}`);
            expect(recorded).toHaveLength(1);
            expect(recorded![0]!.status).toBe(u.k < 3 ? "handed_off" : "failed");
            expect(recorded![0]!.attempts).toBe(Math.min(u.k + 1, 3));
          }
          expect(summary.handedOff + summary.failed).toBe(users.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});
