// Feature: aerobrief-phase2, Property 8: Digest content selection
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { MONITORED_IDS } from "../src/airports";
import { selectDigestContent, type DigestEventLike } from "../src/digest/content";
import { airportIdArb } from "./arbitraries";

const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date("2026-06-15T12:00:00.000Z");

type TestEvent = DigestEventLike & { explanation: string; seq: number };

// Offsets (ms before now): future, exactly now, exactly 24 h, just past 24 h, and a wide range.
const ageMsArb = fc.oneof(
  fc.integer({ min: -3 * HOUR_MS, max: -1 }),
  fc.constantFrom(0, 24 * HOUR_MS, 24 * HOUR_MS + 1, 24 * HOUR_MS - 1),
  fc.integer({ min: 0, max: 26 * HOUR_MS }),
  // Few distinct values so ties are common.
  fc.constantFrom(HOUR_MS, 2 * HOUR_MS, 5 * HOUR_MS),
);

const eventArb: fc.Arbitrary<Omit<TestEvent, "seq">> = fc.oneof(
  { weight: 4, arbitrary: fc.record({
    type: fc.constantFrom("GROUND_STOP_STARTED", "GROUND_STOP_ENDED"),
    airportId: airportIdArb as fc.Arbitrary<string | null>,
    occurredAt: ageMsArb.map((a) => new Date(NOW.getTime() - a).toISOString()),
    explanation: fc.string({ maxLength: 40 }),
  }) },
  { weight: 2, arbitrary: fc.record({
    type: fc.constant("NATIONWIDE_EVENT"),
    airportId: fc.constant<string | null>(null),
    occurredAt: ageMsArb.map((a) => new Date(NOW.getTime() - a).toISOString()),
    explanation: fc.string({ maxLength: 40 }),
  }) },
  { weight: 1, arbitrary: fc.record({
    type: fc.constantFrom("GROUND_STOP_STARTED", "NATIONWIDE_EVENT"),
    airportId: fc.option(airportIdArb, { nil: null }),
    occurredAt: fc.constantFrom("", "not a date", "2026-13-45T99:99:99Z"),
    explanation: fc.string({ maxLength: 40 }),
  }) },
);

const eventsArb: fc.Arbitrary<TestEvent[]> = fc
  .array(eventArb, { maxLength: 25 })
  .map((es) => es.map((e, seq) => ({ ...e, seq })));

const watchedArb = fc.subarray([...MONITORED_IDS], { maxLength: 6 });

function qualifies(e: TestEvent, watched: ReadonlySet<string>): boolean {
  const t = new Date(e.occurredAt).getTime();
  if (Number.isNaN(t)) return false;
  const age = NOW.getTime() - t;
  if (age < 0 || age > 24 * HOUR_MS) return false;
  return e.type === "NATIONWIDE_EVENT" || (e.airportId !== null && watched.has(e.airportId));
}

describe("Property 8: Digest content selection", () => {
  it("keeps exactly the qualifying events, in time order, unaltered", () => {
    fc.assert(
      fc.property(eventsArb, watchedArb, fc.boolean(), (events, watchedIds, asSet) => {
        const watched = new Set<string>(watchedIds);
        const out = selectDigestContent({
          now: NOW,
          events,
          watchedAirportIds: asSet ? watched : watchedIds,
        });

        // Output is a subset of input, same object identities, no duplicates.
        for (const e of out) expect(events.includes(e)).toBe(true);
        expect(new Set(out).size).toBe(out.length);

        // Every kept event qualifies; every qualifying event is kept.
        for (const e of out) expect(qualifies(e, watched)).toBe(true);
        const expected = events.filter((e) => qualifies(e, watched));
        expect(out.length).toBe(expected.length);
        for (const e of expected) expect(out.includes(e)).toBe(true);

        // Time order non-decreasing; ties keep input order.
        for (let i = 1; i < out.length; i++) {
          const a = new Date(out[i - 1]!.occurredAt).getTime();
          const b = new Date(out[i]!.occurredAt).getTime();
          expect(a).toBeLessThanOrEqual(b);
          if (a === b) expect(out[i - 1]!.seq).toBeLessThan(out[i]!.seq);
        }

        // Explanation strings identical to the stored ones.
        for (const e of out) expect(e.explanation).toBe(events[e.seq]!.explanation);
      }),
      { numRuns: 200 },
    );
  });

  it("includes the age 0 and age 24 h boundaries and drops future and older events", () => {
    const mk = (ageMs: number, seq: number): TestEvent => ({
      type: "NATIONWIDE_EVENT",
      airportId: null,
      occurredAt: new Date(NOW.getTime() - ageMs).toISOString(),
      explanation: `e${seq}`,
      seq,
    });
    const events = [mk(-1, 0), mk(0, 1), mk(24 * HOUR_MS, 2), mk(24 * HOUR_MS + 1, 3)];
    const out = selectDigestContent({ now: NOW, events, watchedAirportIds: [] });
    expect(out.map((e) => e.seq)).toEqual([2, 1]);
  });
});
