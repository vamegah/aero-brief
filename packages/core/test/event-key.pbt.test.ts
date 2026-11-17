import { describe, expect, test } from "vitest";
import fc from "fast-check";
import type { GroundStopEvent } from "../src/change-detector";
import { type AlertCandidate, claimAlerts } from "../src/dedupe";
import { eventKey } from "../src/event-keys";
import { airportIdArb, isoTimestampArb, tokenArb } from "./arbitraries";

const NUM_RUNS = 100;

const groundStopEventArb: fc.Arbitrary<GroundStopEvent> = fc.record({
  type: fc.constantFrom("GROUND_STOP_STARTED" as const, "GROUND_STOP_ENDED" as const),
  airportId: airportIdArb,
  occurredAt: isoTimestampArb,
  faaEventId: tokenArb.map((t) => `faa:${t}`),
  reason: fc.constant(null),
});

const prevIdArb = fc.option(fc.uuid(), { nil: null });

// Feature: aerobrief, Property 34: Event key and alert dedup are independent of the Snapshot
describe("Property 34: Event key and alert dedup are independent of the Snapshot", () => {
  // **Validates: Requirements 9.9, 9.10**
  test("event key equals faaEventId regardless of snapshot id, capture time and previousSnapshotId", () => {
    fc.assert(
      fc.property(groundStopEventArb, prevIdArb, prevIdArb, isoTimestampArb, (e, prevA, prevB, laterTime) => {
        const redetected: GroundStopEvent = { ...e, occurredAt: laterTime };
        expect(eventKey(e, prevA)).toBe(e.faaEventId);
        expect(eventKey(redetected, prevB)).toBe(eventKey(e, prevA));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // **Validates: Requirements 9.9, 9.10**
  test("STARTED and ENDED of one FAA event share an event key but differ in (event_key, event_type)", () => {
    fc.assert(
      fc.property(groundStopEventArb, prevIdArb, prevIdArb, (e, prevA, prevB) => {
        const started: GroundStopEvent = { ...e, type: "GROUND_STOP_STARTED" };
        const ended: GroundStopEvent = { ...e, type: "GROUND_STOP_ENDED" };
        const sKey = eventKey(started, prevA);
        const eKey = eventKey(ended, prevB);
        expect(sKey).toBe(eKey);
        expect(`${sKey}|${started.type}`).not.toBe(`${eKey}|${ended.type}`);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // **Validates: Requirements 9.9, 9.10**
  test("two pipeline runs over the same FAA events send exactly once per (FAA_Event_ID, type, user)", () => {
    fc.assert(
      fc.property(
        fc.array(groundStopEventArb, { maxLength: 15 }),
        fc.array(tokenArb, { minLength: 1, maxLength: 5 }),
        fc.array(fc.tuple(fc.uuid(), isoTimestampArb), { minLength: 2, maxLength: 2 }),
        prevIdArb,
        prevIdArb,
        (events, users, runMeta, prev1, prev2) => {
          const buildRun = (previousSnapshotId: string | null, capturedAt: string): AlertCandidate[] =>
            events.flatMap((event) =>
              users.map((userId) => ({
                event: { ...event, occurredAt: capturedAt },
                previousSnapshotId,
                userId,
              })),
            );

          const run1 = buildRun(prev1, runMeta[0]![1]);
          const run2 = buildRun(prev2 ?? runMeta[1]![0], runMeta[1]![1]);

          const first = claimAlerts(run1, new Set());
          const second = claimAlerts(run2, first.claimed);

          const sends = [...first.toSend, ...second.toSend].map(
            (c) => `${(c.event as GroundStopEvent).faaEventId}|${c.event.type}|${c.userId}`,
          );
          const expected = new Set(
            events.flatMap((e) => users.map((u) => `${e.faaEventId}|${e.type}|${u}`)),
          );

          expect(second.toSend).toEqual([]);
          expect(new Set(sends).size).toBe(sends.length);
          expect(new Set(sends)).toEqual(expected);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
