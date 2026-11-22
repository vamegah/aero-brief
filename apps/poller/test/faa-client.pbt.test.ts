import { createLogger, type Logger } from "@aerobrief/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Env } from "../src/env";
import { FAA_API_URL, fetchFaa, type FaaFetchResult, type FetchFn } from "../src/faa-client";
import { runPoll, type PollDeps, type PollRepositories } from "../src/poll";

// Preservation tests for the faa-403-poller bugfix. They run against direct mode
// (no relay config) and must pass before and after the fix.

const NUM_RUNS = 100;

const okBody = JSON.stringify([{ airportId: "JFK", airportLongName: "John F Kennedy", groundStop: null }]);

/** Statuses that Response accepts without a body and that `res.ok` treats as failures. */
const failureStatus = fc.integer({ min: 300, max: 599 });
const successStatus = fc.integer({ min: 200, max: 299 }).filter((s) => s !== 204 && s !== 205);

const timeoutName = fc.constantFrom("TimeoutError", "AbortError");
const otherErrorName = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((n) => n !== "TimeoutError" && n !== "AbortError");

function truncate200(text: string): string {
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

function namedError(name: string, message: string): Error {
  const err = new Error(message);
  err.name = name;
  return err;
}

function isTypedResult(result: FaaFetchResult): boolean {
  if (result.ok) return Array.isArray(result.response) && typeof result.fetchedAt === "string";
  return (
    ["timeout", "http_status", "network", "unparseable", "validation"].includes(result.kind) &&
    typeof result.detail === "string"
  );
}

describe("fetchFaa preservation (direct mode)", () => {
  // Feature: faa-403-poller, Property 2: Preservation - Poller behavior outside the bug
  // **Validates: Requirements 3.1, 3.2, 3.3**
  it("maps any non-2xx status to http_status with detail 'HTTP <status>'", async () => {
    await fc.assert(
      fc.asyncProperty(failureStatus, async (status) => {
        const fn: FetchFn = async () => new Response(null, { status });
        const result = await fetchFaa(fn);
        expect(result).toEqual({ ok: false, kind: "http_status", detail: `HTTP ${status}` });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: faa-403-poller, Property 2: Preservation - Poller behavior outside the bug
  // **Validates: Requirements 3.2, 3.3**
  it("maps thrown timeout errors to timeout", async () => {
    await fc.assert(
      fc.asyncProperty(timeoutName, fc.string({ maxLength: 50 }), async (name, message) => {
        const fn: FetchFn = async () => {
          throw namedError(name, message);
        };
        const result = await fetchFaa(fn);
        expect(result).toMatchObject({ ok: false, kind: "timeout" });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: faa-403-poller, Property 2: Preservation - Poller behavior outside the bug
  // **Validates: Requirements 3.2, 3.3**
  it("maps any other thrown error to network with a truncated 'Name: message' detail", async () => {
    await fc.assert(
      fc.asyncProperty(otherErrorName, fc.string({ maxLength: 400 }), async (name, message) => {
        const fn: FetchFn = async () => {
          throw namedError(name, message);
        };
        const result = await fetchFaa(fn);
        expect(result).toEqual({ ok: false, kind: "network", detail: truncate200(`${name}: ${message}`) });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: faa-403-poller, Property 2: Preservation - Poller behavior outside the bug
  // **Validates: Requirements 3.2, 3.3**
  it("never throws and always returns a typed result, for any status, body or thrown value", async () => {
    const outcome = fc.oneof(
      fc.record({ type: fc.constant("response" as const), status: successStatus, body: fc.string({ maxLength: 500 }) }),
      fc.record({ type: fc.constant("status" as const), status: failureStatus }),
      fc.record({ type: fc.constant("throw" as const), value: fc.anything() }),
    );
    await fc.assert(
      fc.asyncProperty(outcome, async (o) => {
        const fn: FetchFn = async () => {
          if (o.type === "throw") throw o.value;
          if (o.type === "status") return new Response(null, { status: o.status });
          return new Response(o.body, { status: o.status });
        };
        const result = await fetchFaa(fn);
        expect(isTypedResult(result)).toBe(true);
        if (!result.ok) expect(result.detail.length).toBeLessThanOrEqual(201);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: faa-403-poller, Property 2: Preservation - Poller behavior outside the bug
  // **Validates: Requirements 3.2, 3.3**
  it("maps a 2xx non-JSON body to unparseable and valid JSON of the wrong shape to validation", async () => {
    const notJson = fc
      .string({ minLength: 1, maxLength: 300 })
      .filter((s) => {
        try {
          JSON.parse(s);
          return false;
        } catch {
          return true;
        }
      });
    const wrongShape = fc.oneof(
      fc.record({ not: fc.string() }).map((v) => JSON.stringify(v)),
      fc.integer().map((v) => JSON.stringify(v)),
    );
    await fc.assert(
      fc.asyncProperty(successStatus, notJson, wrongShape, async (status, bad, shape) => {
        const unparseable = await fetchFaa(async () => new Response(bad, { status }));
        expect(unparseable).toMatchObject({ ok: false, kind: "unparseable" });
        const validation = await fetchFaa(async () => new Response(shape, { status }));
        expect(validation).toMatchObject({ ok: false, kind: "validation" });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: faa-403-poller, Property 2: Preservation - Poller behavior outside the bug
  // **Validates: Requirements 3.1, 3.2**
  it("returns ok for a valid body on any 2xx status", async () => {
    await fc.assert(
      fc.asyncProperty(successStatus, async (status) => {
        const result = await fetchFaa(async () => new Response(okBody, { status }));
        expect(result.ok).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: faa-403-poller, Property 2: Preservation - Poller behavior outside the bug
  // **Validates: Requirements 3.1**
  it("calls only FAA_API_URL, once, with an AbortSignal and no key header", async () => {
    const outcome = fc.oneof(
      failureStatus.map((status) => ({ kind: "status" as const, status })),
      fc.constant({ kind: "ok" as const }),
      fc.string({ maxLength: 30 }).map((message) => ({ kind: "throw" as const, message })),
    );
    await fc.assert(
      fc.asyncProperty(outcome, async (o) => {
        const calls: { url: string; init: Parameters<FetchFn>[1] }[] = [];
        const fn: FetchFn = async (url, init) => {
          calls.push({ url, init });
          if (o.kind === "throw") throw new TypeError(o.message);
          if (o.kind === "status") return new Response(null, { status: o.status });
          return new Response(okBody, { status: 200 });
        };
        await fetchFaa(fn);
        expect(calls).toHaveLength(1);
        expect(calls[0]?.url).toBe(FAA_API_URL);
        expect(new URL(calls[0]?.url ?? "").host).toBe("nasstatus.faa.gov");
        expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
        const headers = (calls[0]?.init as { headers?: Record<string, string> }).headers ?? {};
        expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("x-aerobrief-relay-key");
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("runPoll preservation (direct mode, no relay config)", () => {
  const env: Env = {
    DATABASE_URL: "postgresql://user:pass@host.neon.tech/db",
    RESEND_API_KEY: "re_secret_value",
    UNSUBSCRIBE_SECRET: "unsub_secret_value",
    FRONTEND_URL: "https://aerobrief.example.com",
    MAIL_FROM: "AeroBrief <alerts@example.com>",
  };
  const now = new Date("2025-01-02T12:00:00.000Z");

  type PollOutcome =
    | { kind: "ok" }
    | { kind: "status"; status: number }
    | { kind: "throw"; name: string; message: string }
    | { kind: "badBody" };

  const pollOutcome: fc.Arbitrary<PollOutcome> = fc.oneof(
    fc.constant({ kind: "ok" as const }),
    failureStatus.map((status) => ({ kind: "status" as const, status })),
    fc
      .record({ name: fc.oneof(timeoutName, otherErrorName), message: fc.string({ maxLength: 50 }) })
      .map((v) => ({ kind: "throw" as const, ...v })),
    fc.constant({ kind: "badBody" as const }),
  );

  function expectedKind(o: PollOutcome): string | null {
    if (o.kind === "ok") return null;
    if (o.kind === "status") return "http_status";
    if (o.kind === "badBody") return "unparseable";
    return o.name === "TimeoutError" || o.name === "AbortError" ? "timeout" : "network";
  }

  // Feature: faa-403-poller, Property 2: Preservation - Poller behavior outside the bug
  // **Validates: Requirements 3.1, 3.2, 3.5**
  it("over generated polls, every URL called is FAA_API_URL and the recorded outcome matches the fetch result", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(pollOutcome, { minLength: 1, maxLength: 5 }), async (outcomes) => {
        const urls: string[] = [];
        const recorded: { kind: string; detail: string }[] = [];
        let stored = 0;
        let released = 0;
        const silent = (_line: string) => undefined;
        const logger: Logger = createLogger(
          [env.DATABASE_URL, env.RESEND_API_KEY, env.UNSUBSCRIBE_SECRET],
          { debug: silent, info: silent, warn: silent, error: silent },
        );
        const repos = {
          snapshots: { latestSnapshot: async () => null },
          jobRuns: {
            latestPollRun: async () => null,
            recordFailure: async (kind: string, detail: string) => {
              recorded.push({ kind, detail });
            },
          },
          pollerLease: {
            acquire: async () => "token",
            release: async () => {
              released += 1;
            },
          },
          storePollResult: async () => {
            stored += 1;
            return [];
          },
          subscriptions: { watchersOfAirport: async () => [], usersWithWatchlist: async () => [] },
          alertLog: { claim: async () => [], recordOutcome: async () => undefined, recordLatency: async () => undefined },
        };

        for (const o of outcomes) {
          const fetchFn: FetchFn = async (url) => {
            urls.push(url);
            if (o.kind === "throw") throw namedError(o.name, o.message);
            if (o.kind === "status") return new Response(null, { status: o.status });
            if (o.kind === "badBody") return new Response("<html>not json", { status: 200 });
            return new Response(okBody, { status: 200 });
          };
          const before = { recorded: recorded.length, stored };
          await runPoll(env, now, {
            fetchFn,
            createRepositories: () => repos as unknown as PollRepositories,
            logger,
            notifyFn: (async () => ({ skippedStale: false, claimed: 0, handedOff: 0, failed: 0 })) as NonNullable<
              PollDeps["notifyFn"]
            >,
          });
          const kind = expectedKind(o);
          if (kind === null) {
            expect(stored).toBe(before.stored + 1);
            expect(recorded.length).toBe(before.recorded);
          } else {
            expect(stored).toBe(before.stored);
            expect(recorded.length).toBe(before.recorded + 1);
            expect(recorded[recorded.length - 1]?.kind).toBe(kind);
            if (o.kind === "status") expect(recorded[recorded.length - 1]?.detail).toBe(`HTTP ${o.status}`);
          }
        }

        expect(urls).toHaveLength(outcomes.length);
        for (const url of urls) {
          expect(url).toBe(FAA_API_URL);
          expect(new URL(url).host).toBe("nasstatus.faa.gov");
        }
        expect(released).toBe(outcomes.length);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
