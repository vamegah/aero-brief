import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { deriveFreshness, freshnessChanged, type Freshness } from "../src/lib/freshness";

const freshnessArb: fc.Arbitrary<Freshness> = fc.constantFrom<Freshness>(
  "live",
  "delayed",
  "unavailable",
);

const inputArb = fc.record({
  hasData: fc.boolean(),
  stale: fc.boolean(),
  refreshFailed: fc.boolean(),
});

describe("Property 14: Freshness derivation is total and deterministic", () => {
  // Feature: ui-improvements, Property 14: Freshness derivation is total and deterministic
  // **Validates: Requirements 9.1, 9.5**
  it("returns exactly one known value, is repeatable, and is unavailable without data", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const result = deriveFreshness(input);
        expect(["live", "delayed", "unavailable"]).toContain(result);
        expect(deriveFreshness({ ...input })).toBe(result);
        if (!input.hasData) expect(result).toBe("unavailable");
        else expect(result).toBe(input.stale || input.refreshFailed ? "delayed" : "live");
      }),
      { numRuns: 100 },
    );
  });
});

describe("Property 15: Freshness announcement fires only on change", () => {
  // Feature: ui-improvements, Property 15: Freshness announcement fires only on change
  // **Validates: Requirements 9.4**
  it("is false for repeated values and true exactly where consecutive values differ", () => {
    fc.assert(
      fc.property(fc.array(freshnessArb, { minLength: 2, maxLength: 50 }), (seq) => {
        for (let i = 1; i < seq.length; i++) {
          const prev = seq[i - 1] as Freshness;
          const next = seq[i] as Freshness;
          expect(freshnessChanged(prev, next)).toBe(prev !== next);
          if (prev === next) expect(freshnessChanged(prev, next)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });
});
