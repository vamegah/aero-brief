import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { detectChanges } from "../src/change-detector";
import { partialSnapshotArb, snapshotArb } from "./arbitraries";

/** Recursively freeze a value so any mutation throws in strict mode (ES modules). */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

const anySnapshotArb = fc.oneof(snapshotArb, partialSnapshotArb);

// Feature: aerobrief, Property 4: Change detection is pure and deterministic
// **Validates: Requirements 3.1**
describe("Property 4: Change detection is pure and deterministic", () => {
  test("two calls return deeply equal results and inputs are not mutated", () => {
    fc.assert(
      fc.property(anySnapshotArb, fc.option(anySnapshotArb, { nil: null }), (current, previous) => {
        const curCopy = structuredClone(current);
        const prevCopy = structuredClone(previous);
        deepFreeze(current);
        deepFreeze(previous);

        const first = detectChanges(current, previous);
        const second = detectChanges(current, previous);

        expect(second).toEqual(first);
        expect(current).toEqual(curCopy);
        expect(previous).toEqual(prevCopy);
      }),
      { numRuns: 100 },
    );
  });
});
