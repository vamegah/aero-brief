import fc from "fast-check";
import { describe, it } from "vitest";
import { pairGroundStopDurations } from "../src/lib/ground-stop-durations";

const T0 = Date.UTC(2026, 0, 2, 0, 0, 0);

const eventArb = fc.record({
  type: fc.constantFrom("GROUND_STOP_STARTED", "GROUND_STOP_ENDED", "NATIONWIDE_EVENT"),
  airportId: fc.constantFrom("ATL", "JFK", "ORD"),
  minute: fc.integer({ min: 0, max: 60 }),
});

describe("Property 39: Ground stop duration pairing", () => {
  // Feature: aerobrief, Property 39: Ground stop duration pairing
  // **Validates: Requirements 18.6**
  it("pairs each started Event at most once, in order, within one airport, never across an ended Event", () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 30 }), (raw) => {
        const events = raw.map((e) => ({
          type: e.type,
          airportId: e.airportId,
          occurredAt: new Date(T0 + e.minute * 60_000).toISOString(),
        }));
        const time = (i: number) => Date.parse(events[i]!.occurredAt);
        const result = pairGroundStopDurations(events);

        const used = new Set<number>();
        for (const [endedIndex, duration] of result) {
          const ended = events[endedIndex]!;
          if (ended.type !== "GROUND_STOP_ENDED" || duration < 0) return false;

          // Candidate started Events: same airport, no later than the ended Event.
          const candidates = events
            .map((e, i) => ({ e, i }))
            .filter(({ e, i }) => e.type === "GROUND_STOP_STARTED" && e.airportId === ended.airportId && time(i) <= time(endedIndex) && time(i) === time(endedIndex) - duration);
          if (candidates.length === 0) return false;

          // Some candidate must be unused and have no other ended Event strictly between.
          const free = candidates.find(({ i }) => {
            if (used.has(i)) return false;
            return !events.some(
              (o, j) => j !== endedIndex && o.type === "GROUND_STOP_ENDED" && o.airportId === ended.airportId && time(j) > time(i) && time(j) < time(endedIndex),
            );
          });
          if (free === undefined) return false;
          used.add(free.i);
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  // Feature: aerobrief, Property 39: Ground stop duration pairing
  // **Validates: Requirements 18.6**
  it("never pairs Events of different airports", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 60 }), { maxLength: 10 }), (minutes) => {
        const events = minutes.flatMap((m, k) => [
          { type: "GROUND_STOP_STARTED", airportId: `A${k}`, occurredAt: new Date(T0 + m * 60_000).toISOString() },
          { type: "GROUND_STOP_ENDED", airportId: `B${k}`, occurredAt: new Date(T0 + (m + 5) * 60_000).toISOString() },
        ]);
        return pairGroundStopDurations(events).size === 0;
      }),
      { numRuns: 100 },
    );
  });
});
