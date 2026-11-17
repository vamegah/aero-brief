import { describe, test } from "vitest";
import fc from "fast-check";
import { RETENTION_MS, withinRetention } from "../src/time";

const HOUR_MS = 3_600_000;
const MAX_AGE_AFTER_CLEANUP_MS = 25 * HOUR_MS;
const CLEANUP_INTERVAL_MS = 60 * 60_000;

const baseMs = Date.UTC(2025, 0, 1);
const spanMs = 10 * 24 * HOUR_MS;

// Cleanup time t, with record timestamps from ~8 days before to ~2 days after (incl. future).
const timeArb = fc.integer({ min: 0, max: spanMs }).map((o) => baseMs + o);
const recordArb = fc.integer({ min: -8 * 24 * HOUR_MS, max: 2 * 24 * HOUR_MS });

describe("cleanup age bound", () => {
  // Feature: aerobrief, Property 30: Age bound after cleanup
  // **Validates: Requirements 11.5**
  test("every record kept by cleanup at t is at most 25 h old at t + d, 0 <= d <= 60 min", () => {
    fc.assert(
      fc.property(
        timeArb,
        fc.array(recordArb, { maxLength: 50 }),
        fc.integer({ min: 0, max: CLEANUP_INTERVAL_MS }),
        (t, offsets, d) => {
          const cleanupAt = new Date(t);
          const records = offsets.map((o) => new Date(t + o).toISOString());
          // Cleanup deletes exactly the records outside retention (Property 29 complement).
          const remaining = records.filter((r) => withinRetention(r, cleanupAt));
          const later = t + d;
          return remaining.every(
            (r) =>
              later - new Date(r).getTime() <= MAX_AGE_AFTER_CLEANUP_MS &&
              later - new Date(r).getTime() <= RETENTION_MS + CLEANUP_INTERVAL_MS,
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});
