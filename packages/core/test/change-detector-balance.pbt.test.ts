import { describe, it } from "vitest";
import fc from "fast-check";
import { detectChanges } from "../src/change-detector";
import type { Snapshot } from "../src/schemas";
import { snapshotArb } from "./arbitraries";

const activeCount = (s: Snapshot | null): number =>
  s === null ? 0 : s.airports.filter((a) => a.groundStop !== null).length;

describe("change detector balance", () => {
  // Feature: aerobrief, Property 8: Started minus ended equals the change in active count
  // **Validates: Requirements 3.7**
  it("Property 8: STARTED minus ENDED equals the change in active airport count", () => {
    fc.assert(
      fc.property(snapshotArb, fc.option(snapshotArb, { nil: null }), (current, previous) => {
        const events = detectChanges(current, previous);
        const started = events.filter((e) => e.type === "GROUND_STOP_STARTED").length;
        const ended = events.filter((e) => e.type === "GROUND_STOP_ENDED").length;
        return started - ended === activeCount(current) - activeCount(previous);
      }),
      { numRuns: 200 },
    );
  });
});
