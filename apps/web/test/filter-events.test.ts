import { describe, expect, it } from "vitest";
import { EVENT_TYPES } from "../src/lib/event-types";
import { NO_EVENT_FILTER, filterEvents } from "../src/lib/filter-events";

interface Ev {
  id: number;
  type: string;
  airportId: string | null;
}

const events: Ev[] = [
  { id: 1, type: "GROUND_STOP_STARTED", airportId: "ATL" },
  { id: 2, type: "GROUND_STOP_ENDED", airportId: "ATL" },
  { id: 3, type: "GROUND_STOP_STARTED", airportId: "JFK" },
  { id: 4, type: "NATIONWIDE_EVENT", airportId: null },
  { id: 5, type: "SOMETHING_NEW", airportId: "JFK" },
];
const ids = (list: Ev[]) => list.map((e) => e.id);

describe("filterEvents", () => {
  it("keeps everything under the no-op filter", () => {
    expect(ids(filterEvents(events, NO_EVENT_FILTER))).toEqual([1, 2, 3, 4, 5]);
  });

  it("filters by one airport", () => {
    expect(ids(filterEvents(events, { airportId: "ATL", type: null }))).toEqual([1, 2]);
  });

  it("filters by one type", () => {
    expect(ids(filterEvents(events, { airportId: null, type: "GROUND_STOP_STARTED" }))).toEqual([1, 3]);
  });

  it("filters by airport and type together", () => {
    expect(ids(filterEvents(events, { airportId: "JFK", type: "GROUND_STOP_STARTED" }))).toEqual([3]);
  });

  it("keeps a system-wide event under all airports and drops it under an airport", () => {
    expect(ids(filterEvents(events, { airportId: null, type: "NATIONWIDE_EVENT" }))).toEqual([4]);
    expect(ids(filterEvents(events, { airportId: "ATL", type: "NATIONWIDE_EVENT" }))).toEqual([]);
    expect(filterEvents(events, { airportId: "ATL", type: null }).some((e) => e.airportId === null)).toBe(false);
  });

  it("keeps an unknown type only under all types", () => {
    expect(EVENT_TYPES).not.toContain("SOMETHING_NEW");
    expect(ids(filterEvents(events, NO_EVENT_FILTER))).toContain(5);
    for (const type of EVENT_TYPES) {
      expect(ids(filterEvents(events, { airportId: null, type }))).not.toContain(5);
    }
  });

  it("returns an empty array for empty input", () => {
    expect(filterEvents([], NO_EVENT_FILTER)).toEqual([]);
    expect(filterEvents([], { airportId: "ATL", type: "GROUND_STOP_STARTED" })).toEqual([]);
  });

  it("does not change the input and returns a new array", () => {
    const input = events.map((e) => ({ ...e }));
    const snapshot = JSON.parse(JSON.stringify(input)) as Ev[];
    const out = filterEvents(input, NO_EVENT_FILTER);
    expect(input).toEqual(snapshot);
    expect(out).not.toBe(input);
    expect(out).toEqual(input);
  });
});
