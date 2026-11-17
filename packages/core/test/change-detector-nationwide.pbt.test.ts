import { describe, test } from "vitest";
import fc from "fast-check";
import { MONITORED_IDS, artccOf } from "../src/airports";
import { type NationwideEvent, type Snapshot, detectChanges } from "../src/change-detector";
import { partialSnapshotArb, snapshotArb } from "./arbitraries";

const RUNS = { numRuns: 300 };

/** Keep ground stops only on a small subset so counts around the threshold (2/3) are common. */
const sparseSnapshotArb: fc.Arbitrary<Snapshot> = fc
  .tuple(snapshotArb, fc.subarray([...MONITORED_IDS], { maxLength: 5 }))
  .map(([s, keep]) => ({
    ...s,
    airports: s.airports.map((a) => (keep.includes(a.airportId) ? a : { ...a, groundStop: null })),
  }));

const anySnapshotArb = fc.oneof(snapshotArb, sparseSnapshotArb, partialSnapshotArb);

function distinctArtccs(s: Snapshot | null): string[] {
  const set = new Set<string>();
  for (const a of s?.airports ?? []) if (a.groundStop !== null) set.add(artccOf(a.airportId));
  return [...set];
}

describe("Property 10: Nationwide emission", () => {
  /**
   * Feature: aerobrief, Property 10: Nationwide emission
   * **Validates: Requirements 4.1, 4.2, 4.3, 4.6**
   */
  test("exactly one NATIONWIDE_EVENT iff c >= 3 and p < 3; fields match distinct ARTCCs", () => {
    fc.assert(
      fc.property(anySnapshotArb, fc.option(anySnapshotArb, { nil: null }), (current, previous) => {
        const nationwide = detectChanges(current, previous).filter(
          (e): e is NationwideEvent => e.type === "NATIONWIDE_EVENT",
        );
        const cArtccs = distinctArtccs(current);
        const c = cArtccs.length;
        const p = distinctArtccs(previous).length;

        if (!(c >= 3 && p < 3)) return nationwide.length === 0;
        if (nationwide.length !== 1) return false;
        const e = nationwide[0]!;
        return (
          e.count === e.affectedArtccs.length &&
          new Set(e.affectedArtccs).size === e.affectedArtccs.length &&
          e.affectedArtccs.length === c &&
          [...e.affectedArtccs].sort().join(",") === [...cArtccs].sort().join(",")
        );
      }),
      RUNS,
    );
  });

  test("generators exercise both emitting and non-emitting cases", () => {
    let emitted = 0;
    let suppressed = 0;
    fc.assert(
      fc.property(anySnapshotArb, fc.option(anySnapshotArb, { nil: null }), (current, previous) => {
        const has = detectChanges(current, previous).some((e) => e.type === "NATIONWIDE_EVENT");
        if (has) emitted++;
        else suppressed++;
        return true;
      }),
      RUNS,
    );
    return emitted > 0 && suppressed > 0 ? undefined : Promise.reject(new Error("generator lacks coverage"));
  });
});
