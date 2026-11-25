import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { formatDurationText } from "../src/format-duration";

describe("formatDurationText properties", () => {
  // Feature: ui-review-fixes, Property 8: Duration text agrees across surfaces
  test("Property 8: text is determined by whole minutes and never says 'minutes'", () => {
    // **Validates: Requirements 20.1, 20.2, 20.3, 20.4**
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), (minutes) => {
        const text = formatDurationText(minutes * 60_000);
        expect(text).not.toContain("minutes");
        if (minutes < 1) {
          expect(text).toBe("less than 1 min");
        } else if (minutes < 60) {
          expect(text).toBe(`${minutes} min`);
        } else {
          const h = Math.floor(minutes / 60);
          const m = minutes % 60;
          expect(text).toBe(m === 0 ? `${h} h` : `${h} h ${m} min`);
        }
        // Sub-minute remainders are floored.
        expect(formatDurationText(minutes * 60_000 + 59_999)).toBe(text);
      }),
      { numRuns: 200 },
    );
  });
});
