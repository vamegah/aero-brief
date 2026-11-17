import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { detectChanges, type DetectedEvent, type GroundStopEvent, type Snapshot } from "../src/change-detector";
import { partialSnapshotArb, snapshotArb } from "./arbitraries";

const anySnapshotArb = fc.oneof(snapshotArb, partialSnapshotArb);
const previousArb = fc.oneof(anySnapshotArb, fc.constant<Snapshot | null>(null));

const isGroundStop = (e: DetectedEvent): e is GroundStopEvent => e.type !== "NATIONWIDE_EVENT";

describe("detectChanges ordering and uniqueness", () => {
  // Feature: aerobrief, Property 9: Event ordering and uniqueness
  test("Property 9: Event ordering and uniqueness", () => {
    fc.assert(
      fc.property(anySnapshotArb, previousArb, (current, previous) => {
        const events = detectChanges(current, previous);
        const groundStops = events.filter(isGroundStop);
        const nationwide = events.filter((e) => e.type === "NATIONWIDE_EVENT");

        // At most one ground stop Event per airport, in strictly ascending id order.
        const ids = groundStops.map((e) => e.airportId);
        for (let i = 1; i < ids.length; i++) {
          expect(ids[i - 1]! < ids[i]!).toBe(true);
        }
        expect(new Set(ids).size).toBe(ids.length);

        // NATIONWIDE_EVENT at most once, and only after all ground stop Events.
        expect(nationwide.length).toBeLessThanOrEqual(1);
        expect(events.slice(0, groundStops.length).every(isGroundStop)).toBe(true);
        if (nationwide.length === 1) {
          expect(events[events.length - 1]?.type).toBe("NATIONWIDE_EVENT");
        }
      }),
      { numRuns: 200 },
    );
  });
});
