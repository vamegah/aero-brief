import { describe, test } from "vitest";
import fc from "fast-check";
import { MONITORED_IDS, isMonitoredId } from "../src/airports";
import { type GroundStopEvent, type Snapshot, detectChanges } from "../src/change-detector";
import { partialSnapshotArb, snapshotArb } from "./arbitraries";

const RUNS = { numRuns: 200 };

const snapshotOrPartialArb = fc.oneof(snapshotArb, partialSnapshotArb);

function stopOf(s: Snapshot | null, id: string) {
  return s?.airports.find((a) => a.airportId === id)?.groundStop ?? null;
}

describe("Property 5: Per-airport transition rule", () => {
  /**
   * Feature: aerobrief, Property 5: Per-airport transition rule
   * **Validates: Requirements 3.2, 3.3, 3.4, 3.8**
   */
  test("per airport: STARTED iff inactive->active, ENDED iff active->inactive, else none", () => {
    fc.assert(
      fc.property(snapshotOrPartialArb, fc.option(snapshotOrPartialArb, { nil: null }), (current, previous) => {
        const events = detectChanges(current, previous);
        const perAirport = events.filter(
          (e): e is GroundStopEvent => e.type === "GROUND_STOP_STARTED" || e.type === "GROUND_STOP_ENDED",
        );

        for (const id of MONITORED_IDS) {
          const c = stopOf(current, id);
          const p = stopOf(previous, id);
          const mine = perAirport.filter((e) => e.airportId === id);

          if (p === null && c !== null) {
            if (mine.length !== 1) return false;
            const e = mine[0]!;
            if (e.type !== "GROUND_STOP_STARTED") return false;
            if (e.faaEventId !== c.faaEventId) return false;
          } else if (p !== null && c === null) {
            if (mine.length !== 1) return false;
            const e = mine[0]!;
            if (e.type !== "GROUND_STOP_ENDED") return false;
            if (e.faaEventId !== p.faaEventId) return false;
          } else if (mine.length !== 0) {
            return false;
          }
        }

        // Every per-airport event: monitored id, occurredAt = current capture time.
        return perAirport.every((e) => isMonitoredId(e.airportId) && e.occurredAt === current.capturedAt);
      }),
      RUNS,
    );
  });
});
