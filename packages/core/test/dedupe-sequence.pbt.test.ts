import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { MONITORED_IDS, type MonitoredId } from "../src/airports";
import type { GroundStopEvent } from "../src/change-detector";
import { type AlertCandidate, claimAlerts } from "../src/dedupe";
import { dedupKey } from "../src/event-keys";

/**
 * Property: for any sequence of poll results (exact duplicates, the same FAA event id
 * with different timestamps, out-of-order arrival), the alert engine emits exactly one
 * alert per unique FAA event id. Validates Requirements 9.4, 9.9, 9.10.
 *
 * Scope: one watching user and GROUND_STOP_STARTED events, so "per FAA event id" and
 * "per (event id, type, user)" coincide. ENDED alerts are covered separately below.
 */

const USER = "user1";
const ID_POOL = ["a1", "b2", "c3", "d4", "e5"]; // small pool forces many repeats

type PollResult = { snapshotId: string; capturedAt: string; events: GroundStopEvent[] };

const isoArb = fc
  .date({ min: new Date("2026-01-01T00:00:00.000Z"), max: new Date("2026-01-02T00:00:00.000Z"), noInvalidDate: true })
  .map((d) => d.toISOString());

const startedArb = (type: GroundStopEvent["type"]): fc.Arbitrary<GroundStopEvent> =>
  fc.record({
    type: fc.constant(type),
    airportId: fc.constantFrom<MonitoredId>(...MONITORED_IDS),
    occurredAt: isoArb, // same FAA id may arrive with any timestamp
    faaEventId: fc.constantFrom(...ID_POOL).map((i) => `faa:${i}`),
    reason: fc.constant(null),
  });

/** A poll may repeat events within itself and across polls; polls arrive in any order. */
const pollSequenceArb = (type: GroundStopEvent["type"]): fc.Arbitrary<PollResult[]> =>
  fc
    .array(
      fc.record({
        snapshotId: fc.uuid(),
        capturedAt: isoArb,
        events: fc.array(startedArb(type), { maxLength: 8 }),
      }),
      { maxLength: 12 },
    )
    .chain((polls) => fc.shuffledSubarray(polls, { minLength: polls.length, maxLength: polls.length }))
    // re-deliver some polls verbatim to model retried polls (exact duplicates)
    .chain((polls) =>
      fc.array(fc.constantFrom(...(polls.length ? polls : [null])), { maxLength: 6 }).map((again) => [
        ...polls,
        ...again.filter((p): p is PollResult => p !== null),
      ]),
    );

/** Runs the sequence through the alert claim step, carrying claimed keys between polls. */
function runSequence(polls: readonly PollResult[]): AlertCandidate[] {
  let claimed: ReadonlySet<string> = new Set();
  const sent: AlertCandidate[] = [];
  let previousSnapshotId: string | null = null;
  for (const poll of polls) {
    const candidates = poll.events.map((event) => ({ event, previousSnapshotId, userId: USER }));
    const result = claimAlerts(candidates, claimed);
    sent.push(...result.toSend);
    claimed = result.claimed;
    previousSnapshotId = poll.snapshotId;
  }
  return sent;
}

/** Runs a property and logs the shrunk counterexample and seed before failing. */
function assertProperty<T>(arb: fc.Arbitrary<T>, predicate: (value: T) => void, numRuns = 500): void {
  const result = fc.check(
    fc.property(arb, (value) => {
      predicate(value);
    }),
    { numRuns },
  );
  if (result.failed) {
    console.error(
      [
        "DEDUPE PROPERTY FAILED",
        `seed: ${result.seed}`,
        `runs before failure: ${result.numRuns}, shrinks: ${result.numShrinks}`,
        `counterexample (shrunk): ${JSON.stringify(result.counterexample?.[0], null, 2)}`,
        `error: ${String(result.errorInstance)}`,
        `replay with: fc.assert(prop, { seed: ${result.seed}, path: "${result.counterexamplePath}" })`,
      ].join("\n"),
    );
  }
  expect(result.failed).toBe(false);
}

describe("alert dedupe over poll sequences", () => {
  it("emits exactly one alert per unique FAA event id", () => {
    assertProperty(pollSequenceArb("GROUND_STOP_STARTED"), (polls) => {
      const sent = runSequence(polls);
      const uniqueIds = new Set(polls.flatMap((p) => p.events.map((e) => e.faaEventId)));
      const sentIds = sent.map((c) => (c.event.type === "NATIONWIDE_EVENT" ? "n/a" : c.event.faaEventId));

      // at most one email per FAA event id
      expect(new Set(sentIds).size).toBe(sentIds.length);
      // and the count of emitted alerts equals the count of unique ids
      expect(sent.length).toBe(uniqueIds.size);
      expect(new Set(sentIds)).toEqual(uniqueIds);
    });
  });

  it("is unaffected by poll order: any permutation emits the same set of ids", () => {
    assertProperty(
      pollSequenceArb("GROUND_STOP_STARTED").chain((polls) =>
        fc.tuple(fc.constant(polls), fc.shuffledSubarray(polls, { minLength: polls.length, maxLength: polls.length })),
      ),
      ([polls, shuffled]) => {
        const ids = (ps: readonly PollResult[]) =>
          runSequence(ps)
            .map((c) => (c.event.type === "NATIONWIDE_EVENT" ? "n/a" : c.event.faaEventId))
            .sort();
        expect(ids(shuffled)).toEqual(ids(polls));
      },
    );
  });

  it("sends at most one alert per (FAA event id, type) when ENDED events are mixed in", () => {
    const mixed = fc
      .tuple(pollSequenceArb("GROUND_STOP_STARTED"), pollSequenceArb("GROUND_STOP_ENDED"))
      .map(([a, b]) => [...a, ...b]);
    assertProperty(mixed, (polls) => {
      const sent = runSequence(polls);
      const keys = sent.map((c) => dedupKey(c.event, null, USER));
      expect(new Set(keys).size).toBe(keys.length);
      const uniquePairs = new Set(polls.flatMap((p) => p.events.map((e) => `${e.faaEventId}|${e.type}`)));
      expect(sent.length).toBe(uniquePairs.size);
    });
  });

  it("reports a deliberately broken dedupe as a failure (harness self-check)", () => {
    // A naive engine that dedupes by timestamp instead of FAA event id must be caught.
    const naive = (polls: readonly PollResult[]) => {
      const seen = new Set<string>();
      let sent = 0;
      for (const e of polls.flatMap((p) => p.events)) {
        if (!seen.has(e.occurredAt)) {
          seen.add(e.occurredAt);
          sent += 1;
        }
      }
      return sent;
    };
    const result = fc.check(
      fc.property(pollSequenceArb("GROUND_STOP_STARTED"), (polls) => {
        const unique = new Set(polls.flatMap((p) => p.events.map((e) => e.faaEventId))).size;
        return naive(polls) === unique;
      }),
      { numRuns: 200 },
    );
    expect(result.failed).toBe(true);
  });
});
