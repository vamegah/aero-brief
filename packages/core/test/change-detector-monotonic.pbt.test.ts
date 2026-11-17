import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { nationwideStatus } from "../src/change-detector";
import type { Snapshot } from "../src/schemas";
import { snapshotArb } from "./arbitraries";

// Feature: aerobrief, Property 12: Nationwide status is monotonic
describe("Property 12: Nationwide status is monotonic", () => {
  /**
   * **Validates: Requirements 4.7**
   *
   * S2 is built from S1 by activating extra airports (no filtering needed).
   */
  it("activating extra airports never turns an active nationwide status inactive", () => {
    fc.assert(
      fc.property(snapshotArb, snapshotArb, (s1, donor) => {
        // Mask picks which inactive airports of S1 get a ground stop copied from donor.
        const s2: Snapshot = {
          ...s1,
          airports: s1.airports.map((a, i) => {
            if (a.groundStop !== null) return a;
            const d = donor.airports[i];
            if (d === undefined || d.groundStop === null) return a;
            return { airportId: a.airportId, groundStop: d.groundStop };
          }),
        };

        // S2's active set is a superset of S1's.
        const active1 = new Set(s1.airports.filter((a) => a.groundStop !== null).map((a) => a.airportId));
        const active2 = new Set(s2.airports.filter((a) => a.groundStop !== null).map((a) => a.airportId));
        for (const id of active1) expect(active2.has(id)).toBe(true);

        const n1 = nationwideStatus(s1);
        const n2 = nationwideStatus(s2);
        if (n1.active) expect(n2.active).toBe(true);
        expect(n2.count).toBeGreaterThanOrEqual(n1.count);
      }),
      { numRuns: 200 },
    );
  });
});
