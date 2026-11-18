import fc from "fast-check";
import { describe, it } from "vitest";
import { sortAirports } from "../src/lib/sort-airports";

// Feature: aerobrief, Property 36: Status table ordering
// **Validates: Requirements 15.6**
describe("Property 36: Status table ordering", () => {
  const airportArb = fc.record({
    airportId: fc.stringMatching(/^[A-Z]{3}$/),
    groundStop: fc.option(fc.record({ reasonText: fc.string() }), { nil: null }),
  });

  it("is a permutation, ground stops first, each group ascending by id", () => {
    fc.assert(
      fc.property(fc.array(airportArb, { maxLength: 30 }), (input) => {
        const out = sortAirports(input);
        const key = (x: { airportId: string; groundStop: unknown }) => `${x.airportId}|${JSON.stringify(x.groundStop)}`;
        if (JSON.stringify(out.map(key).sort()) !== JSON.stringify(input.map(key).sort())) return false;
        const firstRest = out.findIndex((x) => x.groundStop === null);
        const split = firstRest === -1 ? out.length : firstRest;
        if (out.slice(split).some((x) => x.groundStop !== null)) return false;
        const sortedIds = (xs: typeof out) => xs.every((x, i) => i === 0 || xs[i - 1]!.airportId <= x.airportId);
        return sortedIds(out.slice(0, split)) && sortedIds(out.slice(split));
      }),
      { numRuns: 100 },
    );
  });
});
