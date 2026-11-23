import { createLogger, type Logger } from "@aerobrief/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Env } from "../src/env";
import { fetchFaa, type FetchFn } from "../src/faa-client";
import { runPoll, type PollDeps, type PollRepositories } from "../src/poll";

const RELAY_URL = "https://www.aerobriefs.com/api/internal/faa-relay";
const baseEnv: Env = {
  DATABASE_URL: "postgresql://user:pass@host.neon.tech/db",
  RESEND_API_KEY: "re_secret_value",
  UNSUBSCRIBE_SECRET: "unsub_secret_value",
  FRONTEND_URL: "https://aerobrief.example.com",
  MAIL_FROM: "AeroBrief <alerts@example.com>",
};
const now = new Date("2025-01-02T12:00:00.000Z");

const secretArb = fc.stringMatching(/^[A-Za-z0-9]{32,80}$/);

/** All substrings of 8 or more characters that are worth checking: every window of 8 plus the whole secret. */
function leakedFragment(text: string, secret: string): string | null {
  if (text.includes(secret)) return secret;
  for (let i = 0; i + 8 <= secret.length; i++) {
    const frag = secret.slice(i, i + 8);
    if (text.includes(frag)) return frag;
  }
  return null;
}

type Outcome =
  | { kind: "status"; status: number }
  | { kind: "throwWithSecret"; prefix: string; suffix: string }
  | { kind: "badBodyEcho"; prefix: string; suffix: string }
  | { kind: "validationEcho"; key: string };

const outcomeArb: fc.Arbitrary<Outcome> = fc.oneof(
  fc.integer({ min: 300, max: 599 }).map((status) => ({ kind: "status" as const, status })),
  fc.record({
    kind: fc.constant("throwWithSecret" as const),
    prefix: fc.string({ maxLength: 250 }),
    suffix: fc.string({ maxLength: 50 }),
  }),
  fc.record({
    kind: fc.constant("badBodyEcho" as const),
    prefix: fc.string({ maxLength: 250 }),
    suffix: fc.string({ maxLength: 50 }),
  }),
  fc.constant({ kind: "validationEcho" as const, key: "x" }),
);

describe("relay secret handling (Property 6, poller side)", () => {
  // Feature: faa-403-poller, Property 6: The secret never leaks
  // **Validates: Requirements 2.5, 2.6**
  it("the secret and its 8-character substrings are absent from recorded details and every log call", async () => {
    await fc.assert(
      fc.asyncProperty(secretArb, outcomeArb, async (secret, outcome) => {
        const recorded: string[] = [];
        const logs: string[] = [];
        const sink = (line: string) => void logs.push(line);
        const logger: Logger = createLogger([baseEnv.DATABASE_URL], { debug: sink, info: sink, warn: sink, error: sink });
        const repos = {
          snapshots: { latestSnapshot: async () => null },
          jobRuns: {
            latestPollRun: async () => null,
            recordFailure: async (_kind: string, detail: string) => void recorded.push(detail),
          },
          pollerLease: { acquire: async () => "t", release: async () => undefined },
          storePollResult: async () => [],
          subscriptions: { watchersOfAirport: async () => [], usersWithWatchlist: async () => [] },
          alertLog: { claim: async () => [], recordOutcome: async () => undefined, recordLatency: async () => undefined },
        };
        const fetchFn: FetchFn = async (_url, init) => {
          // The relay echoes the key it received, as a misbehaving relay might.
          const key = init.headers?.["x-aerobrief-relay-key"] ?? secret;
          switch (outcome.kind) {
            case "status":
              return new Response(`error: ${key}`, { status: outcome.status });
            case "throwWithSecret":
              throw new TypeError(`${outcome.prefix}${key}${outcome.suffix}`);
            case "badBodyEcho":
              return new Response(`${outcome.prefix}${key}${outcome.suffix}`, { status: 200 });
            case "validationEcho":
              return new Response(JSON.stringify({ [key]: outcome.key }), { status: 200 });
          }
        };
        await runPoll({ ...baseEnv, FAA_RELAY_URL: RELAY_URL, FAA_RELAY_SECRET: secret }, now, {
          fetchFn,
          createRepositories: () => repos as unknown as PollRepositories,
          logger,
          notifyFn: (async () => ({})) as unknown as NonNullable<PollDeps["notifyFn"]>,
        });
        for (const text of [...recorded, ...logs]) expect(leakedFragment(text, secret)).toBeNull();
      }),
      { numRuns: 200 },
    );
  });

  // Feature: faa-403-poller, Property 6 (fetchFaa level): details are scrubbed before truncation
  // **Validates: Requirements 2.5, 2.6**
  it("fetchFaa results never carry the secret, even when truncation would cut it", async () => {
    await fc.assert(
      fc.asyncProperty(secretArb, fc.string({ maxLength: 260 }), async (secret, prefix) => {
        const fetchFn: FetchFn = async () => {
          throw new TypeError(`${prefix}${secret}`);
        };
        const result = await fetchFaa(fetchFn, { url: RELAY_URL, secret });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(leakedFragment(result.detail, secret)).toBeNull();
      }),
      { numRuns: 200 },
    );
  });

  it("an invalid relay config never logs or records the secret value", async () => {
    const secret = "A".repeat(40);
    const recorded: string[] = [];
    const logs: string[] = [];
    const sink = (line: string) => void logs.push(line);
    const repos = {
      snapshots: { latestSnapshot: async () => null },
      jobRuns: { latestPollRun: async () => null, recordFailure: async (_k: string, d: string) => void recorded.push(d) },
      pollerLease: { acquire: async () => "t", release: async () => undefined },
      storePollResult: async () => [],
      subscriptions: { watchersOfAirport: async () => [], usersWithWatchlist: async () => [] },
      alertLog: { claim: async () => [], recordOutcome: async () => undefined, recordLatency: async () => undefined },
    };
    await runPoll({ ...baseEnv, FAA_RELAY_URL: "https://evil.example/x", FAA_RELAY_SECRET: secret }, now, {
      fetchFn: async () => {
        throw new Error("must not be called");
      },
      createRepositories: () => repos as unknown as PollRepositories,
      logger: createLogger([], { debug: sink, info: sink, warn: sink, error: sink }),
    });
    expect(recorded).toEqual(["Invalid relay settings: FAA_RELAY_URL"]);
    expect(logs.join("\n")).not.toContain(secret);
    expect(logs.join("\n")).not.toContain("evil.example");
  });
});
