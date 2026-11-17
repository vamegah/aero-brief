import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { detectChanges } from "../src/change-detector";
import { deriveFaaEventId } from "../src/dedupe";
import { normalizeResponse } from "../src/normalize";
import type { FaaGroundStop, FaaResponse, Snapshot } from "../src/schemas";
import {
  airportIdArb,
  anyStartTimeArb,
  blankIdArb,
  groundStopNumberIdArb,
  groundStopStringIdArb,
  isoTimestampArb,
  unparseableStartTimeArb,
} from "./arbitraries";

const NUM_RUNS = 100;

const nonBlankIdArb = fc.oneof(groundStopStringIdArb, groundStopNumberIdArb);
const noUsableStartArb = fc.oneof(unparseableStartTimeArb, fc.constantFrom<null | undefined>(null, undefined));

/** Ground stop with neither a usable id nor a usable startTime. */
const anonymousStopArb: fc.Arbitrary<FaaGroundStop> = fc.record({
  id: blankIdArb,
  startTime: noUsableStartArb,
});

const stopOf = (airportId: string, gs: FaaGroundStop | null): FaaResponse =>
  [{ airportId, groundStop: gs }] as FaaResponse;

const snapshotAt = (minute: number): { id: string; capturedAt: string } => ({
  id: `snap-${minute}`,
  capturedAt: new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString(),
});

describe("Property 33: FAA_Event_ID derivation", () => {
  // Feature: aerobrief, Property 33: FAA_Event_ID derivation
  // **Validates: Requirements 9.10**

  it("returns the faa: form for a non-blank id, regardless of startTime", () => {
    fc.assert(
      fc.property(airportIdArb, nonBlankIdArb, anyStartTimeArb, isoTimestampArb, (airportId, id, startTime, capturedAt) => {
        const r = deriveFaaEventId(airportId, { id, startTime }, capturedAt, null);
        expect(r).toEqual({ faaEventId: `faa:${String(id).trim()}`, idSource: "faa_id" });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("returns the start: form when id is blank and startTime parses", () => {
    fc.assert(
      fc.property(airportIdArb, blankIdArb, isoTimestampArb, isoTimestampArb, (airportId, id, startTime, capturedAt) => {
        const r = deriveFaaEventId(airportId, { id, startTime }, capturedAt, null);
        expect(r).toEqual({
          faaEventId: `start:${airportId}:${new Date(startTime).toISOString()}`,
          idSource: "start_time",
        });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("returns the seen: form when neither id nor startTime is usable", () => {
    fc.assert(
      fc.property(airportIdArb, anonymousStopArb, isoTimestampArb, (airportId, gs, capturedAt) => {
        const r = deriveFaaEventId(airportId, gs, capturedAt, null);
        expect(r).toEqual({ faaEventId: `seen:${airportId}:${capturedAt}`, idSource: "first_seen" });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("keeps the same FAA_Event_ID across a run of Snapshots for an anonymous active stop", () => {
    fc.assert(
      fc.property(airportIdArb, anonymousStopArb, fc.integer({ min: 2, max: 10 }), (airportId, gs, length) => {
        const snapshots: Snapshot[] = [];
        let previous: Snapshot | null = null;
        for (let i = 0; i < length; i++) {
          const { id, capturedAt } = snapshotAt(i);
          previous = normalizeResponse(stopOf(airportId, gs), capturedAt, id, previous);
          snapshots.push(previous);
        }
        const idsOf = snapshots.map((s) => s.airports.find((a) => a.airportId === airportId)?.groundStop?.faaEventId);
        const first = idsOf[0];
        expect(first).toBe(`seen:${airportId}:${snapshotAt(0).capturedAt}`);
        for (const id of idsOf) expect(id).toBe(first);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("ENDED carries the Previous_Snapshot entry id, which equals the earlier STARTED id", () => {
    fc.assert(
      fc.property(
        airportIdArb,
        fc.oneof(anonymousStopArb, fc.record({ id: nonBlankIdArb, startTime: anyStartTimeArb })),
        fc.integer({ min: 0, max: 5 }),
        (airportId, gs, extraActive) => {
          const empty = (m: number): Snapshot => {
            const { id, capturedAt } = snapshotAt(m);
            return normalizeResponse([], capturedAt, id, null);
          };
          const before = empty(0);
          let previous: Snapshot = before;
          const active: Snapshot[] = [];
          for (let i = 0; i <= extraActive; i++) {
            const { id, capturedAt } = snapshotAt(i + 1);
            previous = normalizeResponse(stopOf(airportId, gs), capturedAt, id, previous);
            active.push(previous);
          }
          const firstActive = active[0] as Snapshot;
          const lastActive = active[active.length - 1] as Snapshot;
          const { id, capturedAt } = snapshotAt(extraActive + 2);
          const after = normalizeResponse([], capturedAt, id, lastActive);

          const started = detectChanges(firstActive, before).find(
            (e) => e.type === "GROUND_STOP_STARTED" && e.airportId === airportId,
          );
          const ended = detectChanges(after, lastActive).find(
            (e) => e.type === "GROUND_STOP_ENDED" && e.airportId === airportId,
          );
          const prevEntryId = lastActive.airports.find((a) => a.airportId === airportId)?.groundStop?.faaEventId;

          expect(started).toBeDefined();
          expect(ended).toBeDefined();
          if (started?.type === "NATIONWIDE_EVENT" || ended?.type === "NATIONWIDE_EVENT") return;
          expect(ended?.faaEventId).toBe(prevEntryId);
          expect(ended?.faaEventId).toBe(started?.faaEventId);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
