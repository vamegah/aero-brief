import { describe, expect, it } from "vitest";
import { formatDuration, pairGroundStopDurations } from "../src/lib/ground-stop-durations";

const MIN = 60_000;
const T0 = Date.UTC(2026, 0, 2, 0, 0, 0);
const ev = (type: "S" | "E", airportId: string | null, minutes: number) => ({
  type: type === "S" ? "GROUND_STOP_STARTED" : "GROUND_STOP_ENDED",
  airportId,
  occurredAt: new Date(T0 + minutes * MIN).toISOString(),
});

describe("formatDuration", () => {
  it.each([
    [0, "Lasted less than 1 min"],
    [59_999, "Lasted less than 1 min"],
    [MIN, "Lasted 1 min"],
    [45 * MIN, "Lasted 45 min"],
    [80 * MIN, "Lasted 1 h 20 min"],
    [120 * MIN, "Lasted 2 h"],
  ])("formats %i ms as %s", (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});

describe("pairGroundStopDurations", () => {
  it("pairs an ended event with the earlier started event (input newest first)", () => {
    const result = pairGroundStopDurations([ev("E", "ATL", 80), ev("S", "ATL", 0)]);
    expect([...result]).toEqual([[0, 80 * MIN]]);
  });

  it("gives nothing to an ended event without a started event", () => {
    expect(pairGroundStopDurations([ev("E", "ATL", 80)]).size).toBe(0);
  });

  it("gives nothing to a second ended event with no started event between", () => {
    const result = pairGroundStopDurations([ev("E", "ATL", 90), ev("E", "ATL", 60), ev("S", "ATL", 0)]);
    expect([...result]).toEqual([[1, 60 * MIN]]);
  });

  it("does not pair across another ended event even when two started events precede", () => {
    const result = pairGroundStopDurations([ev("E", "ATL", 50), ev("E", "ATL", 40), ev("S", "ATL", 20), ev("S", "ATL", 10)]);
    expect([...result]).toEqual([[1, 20 * MIN]]);
  });

  it("never pairs events of different airports", () => {
    expect(pairGroundStopDurations([ev("E", "JFK", 80), ev("S", "ATL", 0)]).size).toBe(0);
  });

  it("treats a started event with an equal timestamp as before", () => {
    const result = pairGroundStopDurations([ev("S", "ATL", 5), ev("E", "ATL", 5)]);
    expect([...result]).toEqual([[1, 0]]);
  });

  it("skips unparseable times and events without an airport", () => {
    const bad = { ...ev("S", "ATL", 0), occurredAt: "nope" };
    expect(pairGroundStopDurations([ev("E", "ATL", 10), bad]).size).toBe(0);
    expect(pairGroundStopDurations([ev("E", null, 10), ev("S", null, 0)]).size).toBe(0);
  });
});
