import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { isStale, STALE_THRESHOLD_MS } from "../src/time";

// Feature: aerobrief, Property 16: Staleness threshold and send gate
// **Validates: Requirements 6.2, 6.3**

const nowArb = fc.date({
  min: new Date("2026-01-01T00:00:00.000Z"),
  max: new Date("2027-01-01T00:00:00.000Z"),
  noInvalidDate: true,
});
// Elapsed ms, weighted toward the 600 000 ms boundary, including negatives (future capture).
const elapsedArb = fc.oneof(
  fc.integer({ min: -3_600_000, max: 7_200_000 }),
  fc.integer({ min: STALE_THRESHOLD_MS - 5, max: STALE_THRESHOLD_MS + 5 }),
);

describe("Property 16: isStale threshold", () => {
  test("isStale is true iff elapsed > 600 s", () => {
    fc.assert(
      fc.property(nowArb, elapsedArb, (now, elapsed) => {
        const capturedAt = new Date(now.getTime() - elapsed).toISOString();
        expect(isStale(capturedAt, now)).toBe(elapsed > 600_000);
      }),
      { numRuns: 200 },
    );
  });

  test("exactly 600 s is not stale and 600.001 s is stale", () => {
    fc.assert(
      fc.property(nowArb, (now) => {
        expect(isStale(new Date(now.getTime() - 600_000).toISOString(), now)).toBe(false);
        expect(isStale(new Date(now.getTime() - 600_001).toISOString(), now)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
