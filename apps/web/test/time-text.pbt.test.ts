import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { AIRPORT_TIME_ZONES } from "@aerobrief/core/airport-time-zones";
import {
  DISPLAY_MODES,
  RELATIVE_THRESHOLD_MS,
  formatTimeText,
  formatTooltip,
  resolveDisplayMode,
} from "../src/lib/time-text";

const zones = Object.values(AIRPORT_TIME_ZONES);
const MIN_MS = Date.UTC(2000, 0, 1);
const MAX_MS = Date.UTC(2100, 0, 1);
const instant = fc.integer({ min: MIN_MS, max: MAX_MS });
const zone = fc.constantFrom(...zones);
const USER_TZ = "Asia/Tokyo";

describe("time-text properties", () => {
  // Feature: ui-improvements, Property 10: Relative/absolute threshold
  // **Validates: Requirements 7.1**
  it("Property 10: relative below 48h, absolute at or above 48h", () => {
    fc.assert(
      fc.property(instant, fc.integer({ min: 0, max: 4 * RELATIVE_THRESHOLD_MS }), zone, (ts, age, tz) => {
        const iso = new Date(ts).toISOString();
        const text = formatTimeText(iso, ts + age, "relative", tz, USER_TZ);
        const relativeStyle = text === "just now" || /^\d+ (min|h) ago$/.test(text);
        expect(relativeStyle).toBe(age < RELATIVE_THRESHOLD_MS);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: ui-improvements, Property 11: Tooltip always shows all three zones
  // **Validates: Requirements 7.2**
  it("Property 11: tooltip has three distinct zone lines", () => {
    fc.assert(
      fc.property(instant, zone, (ts, tz) => {
        const lines = formatTooltip(new Date(ts).toISOString(), tz, USER_TZ).split("\n");
        expect(lines).toHaveLength(3);
        expect(lines[0]).toMatch(/^Airport local: /);
        expect(lines[1]).toMatch(/^Your local: /);
        expect(lines[2]).toMatch(/^UTC: .*UTC$/);
        const times = lines.map((line) => line.slice(line.indexOf(": ") + 2));
        expect(new Set(times).size).toBe(3);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: ui-improvements, Property 12: Display mode resolution
  // **Validates: Requirements 7.3, 7.4**
  it("Property 12: valid modes pass through, everything else is relative", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constantFrom(...DISPLAY_MODES), fc.string(), fc.constant(null), fc.constant(undefined)),
        (stored) => {
          const expected = DISPLAY_MODES.find((m) => m === stored) ?? "relative";
          expect(resolveDisplayMode(stored)).toBe(expected);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("formats modes in their zones", () => {
    const iso = "2026-11-13T19:05:00Z";
    const now = Date.parse(iso) + 25 * 60 * 1000;
    expect(formatTimeText(iso, now, "relative", "America/New_York", USER_TZ)).toBe("25 min ago");
    expect(formatTimeText(iso, now, "airport_local", "America/New_York", USER_TZ)).toContain("14:05");
    expect(formatTimeText(iso, now, "utc", "America/New_York", USER_TZ)).toContain("19:05");
  });
});
