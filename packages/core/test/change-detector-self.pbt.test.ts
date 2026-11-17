import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { detectChanges } from "../src/change-detector";
import { partialSnapshotArb, snapshotArb } from "./arbitraries";

const anySnapshotArb = fc.oneof(snapshotArb, partialSnapshotArb);

// Feature: aerobrief, Property 7: Change detection against itself is empty
// **Validates: Requirements 3.6**
describe("Property 7: Change detection against itself is empty", () => {
  test("detectChanges(S, S) returns an empty list", () => {
    fc.assert(
      fc.property(anySnapshotArb, (s) => {
        expect(detectChanges(s, s)).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  test("detectChanges(S, structuredClone(S)) returns an empty list", () => {
    fc.assert(
      fc.property(anySnapshotArb, (s) => {
        expect(detectChanges(s, structuredClone(s))).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });
});
