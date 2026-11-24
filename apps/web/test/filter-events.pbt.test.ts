import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EVENT_TYPES } from "../src/lib/event-types";
import { NO_EVENT_FILTER, filterEvents, type EventFilter } from "../src/lib/filter-events";

const NUM_RUNS = 200;

const AIRPORTS = ["JFK", "LAX", "ORD", "ATL"] as const;

interface TestEvent {
  id: number;
  type: string;
  airportId: string | null;
}

const typeArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(...EVENT_TYPES),
  fc.string({ maxLength: 8 }),
);
const airportArb: fc.Arbitrary<string | null> = fc.constantFrom<string | null>(...AIRPORTS, null);

/** Events carry a unique id so order and multiplicity can be checked by identity. */
const eventsArb: fc.Arbitrary<TestEvent[]> = fc
  .array(fc.record({ type: typeArb, airportId: airportArb }), { maxLength: 30 })
  .map((list) => list.map((e, id) => ({ id, ...e })));

const filterArb: fc.Arbitrary<EventFilter> = fc.record({
  airportId: airportArb,
  type: fc.oneof(typeArb, fc.constant<string | null>(null)),
});

describe("filterEvents properties", () => {
  // Feature: ui-refresh, Property 5: A filtered list is an ordered subset of the input
  // **Validates: Requirements 20.9, 22.3, 22.4**
  it("Property 5: result is an ordered subset of the input", () => {
    fc.assert(
      fc.property(eventsArb, filterArb, (events, filter) => {
        const result = filterEvents(events, filter);
        const ids = result.map((e) => e.id);
        // Strictly ascending ids: same relative order, no duplicates, nothing invented.
        for (let i = 1; i < ids.length; i++) expect(ids[i]).toBeGreaterThan(ids[i - 1]!);
        for (const e of result) expect(events[e.id]).toBe(e);
        expect(result.length).toBeLessThanOrEqual(events.length);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ui-refresh, Property 6: A filtered list holds exactly the events that match both values
  // **Validates: Requirements 20.5, 20.6, 20.7, 20.8, 22.3, 22.5, 22.6**
  it("Property 6: result holds exactly the events matching both values", () => {
    fc.assert(
      fc.property(eventsArb, filterArb, (events, filter) => {
        const result = filterEvents(events, filter);
        const expected = events.filter(
          (e) =>
            (filter.airportId === null || e.airportId === filter.airportId) &&
            (filter.type === null || e.type === filter.type),
        );
        expect(result).toEqual(expected);
        if (filter.airportId !== null) {
          for (const e of result) expect(e.airportId).not.toBeNull();
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ui-refresh, Property 7: No filter returns every event and nothing is mutated
  // **Validates: Requirements 20.4, 22.1, 22.2**
  it("Property 7: no filter returns a new array with every event, and inputs are not mutated", () => {
    fc.assert(
      fc.property(eventsArb, filterArb, (events, filter) => {
        const snapshot = structuredClone(events);
        const all = filterEvents(events, NO_EVENT_FILTER);
        expect(all).toEqual(events);
        expect(all).not.toBe(events);
        filterEvents(events, filter);
        expect(events).toEqual(snapshot);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
