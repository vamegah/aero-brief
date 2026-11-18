import { describe, expect, it } from "vitest";
import { sortAirports } from "../src/lib/sort-airports";

const a = (airportId: string, stop: boolean) => ({ airportId, groundStop: stop ? { reasonText: "x" } : null });

describe("sortAirports", () => {
  it("puts ground stops first, then ascending by id in each group", () => {
    const out = sortAirports([a("ATL", false), a("SEA", true), a("BOS", false), a("LAX", true)]);
    expect(out.map((x) => x.airportId)).toEqual(["LAX", "SEA", "ATL", "BOS"]);
  });

  it("does not mutate the input", () => {
    const input = [a("SEA", false), a("ATL", true)];
    const copy = [...input];
    sortAirports(input);
    expect(input).toEqual(copy);
  });

  it("handles empty input", () => {
    expect(sortAirports([])).toEqual([]);
  });
});
