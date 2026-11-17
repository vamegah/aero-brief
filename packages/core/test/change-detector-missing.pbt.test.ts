import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { MONITORED_IDS } from "../src/airports";
import { type AirportStatus, type Snapshot, detectChanges } from "../src/change-detector";
import { partialSnapshotArb, snapshotArb } from "./arbitraries";

const RUNS = { numRuns: 100 };

/** Copy of S with an inactive entry added for every monitored airport it lacks. */
function pad(s: Snapshot): Snapshot {
  const have = new Set(s.airports.map((a) => a.airportId));
  const extra: AirportStatus[] = MONITORED_IDS.filter((id) => !have.has(id)).map((airportId) => ({
    airportId,
    groundStop: null,
  }));
  return { ...s, airports: [...s.airports, ...extra] };
}

/** Same airport set as S with every airport inactive. */
function allInactive(s: Snapshot): Snapshot {
  return { ...s, airports: s.airports.map((a) => ({ airportId: a.airportId, groundStop: null })) };
}

describe("change detector: missing data", () => {
  // Feature: aerobrief, Property 6: Missing data is treated as inactive
  // **Validates: Requirements 3.5, 3.9**
  test("detectChanges(S, null) equals detectChanges(S, all-inactive P)", () => {
    fc.assert(
      fc.property(fc.oneof(snapshotArb, partialSnapshotArb), (s) => {
        expect(detectChanges(s, null)).toEqual(detectChanges(s, allInactive(s)));
      }),
      RUNS,
    );
  });

  // Feature: aerobrief, Property 6: Missing data is treated as inactive
  // **Validates: Requirements 3.5, 3.9**
  test("snapshots over different airport subsets equal the result after padding with inactive entries", () => {
    fc.assert(
      fc.property(partialSnapshotArb, partialSnapshotArb, (cur, prev) => {
        expect(detectChanges(cur, prev)).toEqual(detectChanges(pad(cur), pad(prev)));
      }),
      RUNS,
    );
  });

  // Feature: aerobrief, Property 6: Missing data is treated as inactive
  // **Validates: Requirements 3.5, 3.9**
  test("a null or partial previous Snapshot behaves like a padded one", () => {
    fc.assert(
      fc.property(snapshotArb, fc.option(partialSnapshotArb, { nil: null }), (cur, prev) => {
        expect(detectChanges(cur, prev)).toEqual(detectChanges(cur, prev === null ? null : pad(prev)));
      }),
      RUNS,
    );
  });
});
