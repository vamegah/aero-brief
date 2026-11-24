import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MONITORED_IDS, detectChanges, completeSnapshotAirports, SnapshotSchema, type Snapshot } from "../src";
import { airportIdArb, snapshotArb } from "./arbitraries";

const NEW_AIRPORTS = ["BWI", "CLT", "FLL", "HNL", "IAD", "LGA", "MDW", "PHL", "SAN", "TPA"];
const RUNS = { numRuns: 100 };

function withoutStop(s: Snapshot, id: string): Snapshot {
  return { ...s, airports: s.airports.map((a) => (a.airportId === id ? { ...a, groundStop: null } : a)) };
}

describe("change detection with the new airports", () => {
  // Feature: core30-limits, Property 6: Legacy-to-new transition creates no false events, and real changes are detected
  // **Validates: Requirements 4.4, 5.1, 5.2**
  it("a completed legacy snapshot yields no events against the full snapshot", () => {
    fc.assert(
      fc.property(snapshotArb, (raw) => {
        const s: Snapshot = {
          ...raw,
          airports: raw.airports.map((a) => (NEW_AIRPORTS.includes(a.airportId) ? { ...a, groundStop: null } : a)),
        };
        const legacy = s.airports.filter((a) => !NEW_AIRPORTS.includes(a.airportId));
        expect(legacy).toHaveLength(MONITORED_IDS.length - NEW_AIRPORTS.length);
        const l = SnapshotSchema.parse({ ...s, airports: completeSnapshotAirports(legacy) });
        expect(detectChanges(s, l)).toEqual([]);
        expect(detectChanges(l, s)).toEqual([]);
      }),
      RUNS,
    );
  });

  // Feature: core30-limits, Property 6: Legacy-to-new transition creates no false events, and real changes are detected
  // **Validates: Requirements 4.4, 5.1, 5.2**
  it("a ground stop at any monitored airport yields one started event, and its end one ended event", () => {
    fc.assert(
      fc.property(snapshotArb, snapshotArb, airportIdArb, (a, b, id) => {
        const stopped = b.airports.find((x) => x.airportId === id)?.groundStop ?? {
          faaEventId: `faa:${id}-1`,
          idSource: "faa_id" as const,
          reason: null,
          center: null,
          endTime: null,
          expectedEnd: null,
          advisoryUrl: null,
        };
        const withStop: Snapshot = {
          ...a,
          airports: a.airports.map((x) => (x.airportId === id ? { ...x, groundStop: stopped } : x)),
        };
        const without = withoutStop(a, id);

        const started = detectChanges(withStop, without).filter((e) => e.type !== "NATIONWIDE_EVENT");
        expect(started).toHaveLength(1);
        expect(started[0]).toMatchObject({ type: "GROUND_STOP_STARTED", airportId: id });

        const ended = detectChanges(without, withStop).filter((e) => e.type !== "NATIONWIDE_EVENT");
        expect(ended).toHaveLength(1);
        expect(ended[0]).toMatchObject({ type: "GROUND_STOP_ENDED", airportId: id });
      }),
      RUNS,
    );
  });
});
