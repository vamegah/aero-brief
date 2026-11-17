import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { nationwideFromCenters } from "../src/change-detector";

/**
 * Property: for any list of 0 to 10 affected ARTCCs (duplicates allowed), the detector
 * reports nationwide if and only if the number of DISTINCT centers is 3 or more.
 * Validates Requirements 4.1, 4.4, 4.5, 4.6.
 */

// Small alphabet so duplicates are frequent in 0..10 entries.
const centerArb = fc.constantFrom("ZAB", "ZBW", "ZDC", "ZDV", "ZFW", "ZHU", "ZLA", "ZNY");
const centersArb = fc.array(centerArb, { minLength: 0, maxLength: 10 });

/** Runs a property, logs the shrunk counterexample and seed on failure, then fails the test. */
function assertProperty<T>(arb: fc.Arbitrary<T>, predicate: (value: T) => void, numRuns = 1000): void {
  const result = fc.check(
    fc.property(arb, (value) => {
      predicate(value);
    }),
    { numRuns },
  );
  if (result.failed) {
    const centers = result.counterexample?.[0];
    console.error(
      [
        "NATIONWIDE PROPERTY FAILED",
        `seed: ${result.seed}`,
        `runs before failure: ${result.numRuns}, shrinks: ${result.numShrinks}`,
        `counterexample (shrunk): ${JSON.stringify(centers)}`,
        Array.isArray(centers) ? `distinct centers: ${new Set(centers).size}` : "",
        `error: ${String(result.errorInstance)}`,
        `replay with: fc.assert(prop, { seed: ${result.seed}, path: "${result.counterexamplePath}" })`,
      ].join("\n"),
    );
  }
  expect(result.failed).toBe(false);
}

describe("nationwide detector over center lists", () => {
  it("is nationwide if and only if 3 or more distinct centers are affected", () => {
    assertProperty(centersArb, (centers) => {
      const distinct = new Set(centers).size;
      expect(nationwideFromCenters(centers).active).toBe(distinct >= 3);
    });
  });

  it("does not count duplicate entries of the same center twice", () => {
    assertProperty(
      fc.tuple(centersArb, fc.integer({ min: 1, max: 5 })),
      ([centers, copies]) => {
        const inflated = centers.flatMap((c) => Array<string>(copies).fill(c));
        const base = nationwideFromCenters(centers);
        const result = nationwideFromCenters(inflated);
        expect(result.count).toBe(new Set(centers).size);
        expect(result).toEqual(base);
      },
    );
  });

  it("reports a count equal to the distinct centers, as a unique sorted list", () => {
    assertProperty(centersArb, (centers) => {
      const r = nationwideFromCenters(centers);
      expect(r.count).toBe(new Set(centers).size);
      expect(r.artccs).toHaveLength(r.count);
      expect(r.artccs).toEqual([...new Set(centers)].sort());
    });
  });

  it("ignores order and repeated entries", () => {
    assertProperty(
      centersArb.chain((centers) =>
        fc.tuple(fc.constant(centers), fc.shuffledSubarray(centers, { minLength: centers.length, maxLength: centers.length })),
      ),
      ([centers, shuffled]) => {
        expect(nationwideFromCenters(shuffled)).toEqual(nationwideFromCenters(centers));
      },
    );
  });

  it("covers the boundary: exactly 2 distinct is false, exactly 3 distinct is true, however many duplicates", () => {
    assertProperty(
      fc.tuple(fc.integer({ min: 0, max: 8 }), fc.shuffledSubarray(["ZAB", "ZBW", "ZDC", "ZDV"], { minLength: 3, maxLength: 3 })),
      ([extra, three]) => {
        const dupes = Array<string>(extra).fill(three[0] ?? "ZAB");
        expect(nationwideFromCenters([...three.slice(0, 2), ...dupes]).active).toBe(false);
        expect(nationwideFromCenters([...three, ...dupes]).active).toBe(true);
      },
    );
  });

  it("reports a broken detector that counts duplicates (harness self-check)", () => {
    const naive = (centers: readonly string[]) => centers.length >= 3;
    const result = fc.check(
      fc.property(centersArb, (centers) => naive(centers) === new Set(centers).size >= 3),
      { numRuns: 500 },
    );
    expect(result.failed).toBe(true);
  });
});
