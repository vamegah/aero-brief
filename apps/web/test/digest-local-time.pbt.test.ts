import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hourWithLocalEquivalent, localHourLabel } from "../src/lib/digest-local-time";

const ZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
  "Asia/Kolkata",
  "Asia/Kathmandu",
  "Australia/Adelaide",
  "Pacific/Auckland",
  "Pacific/Kiritimati",
  "Not/AZone",
];

function independentLocal(date: Date, zone: string): string {
  let tz = zone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    tz = "UTC";
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("hour")}:${get("minute")} ${get("dayPeriod")}`;
}

describe("hourWithLocalEquivalent", () => {
  it("Property 5: Local hour conversion is a consistent rotation", () => {
    // Feature: ui-review-fixes, Property 5: Local hour conversion is a consistent rotation
    // **Validates: Requirements 11.1**
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 23 }),
        fc.constantFrom(...ZONES),
        fc.date({ min: new Date("2020-01-01T00:00:00Z"), max: new Date("2035-12-31T00:00:00Z"), noInvalidDate: true }),
        (hour, zone, ref) => {
          const text = hourWithLocalEquivalent(hour, zone, ref);
          const instant = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate(), hour));
          const label = independentLocal(instant, zone);
          expect(text.startsWith(`${String(hour).padStart(2, "0")}:00 UTC (`)).toBe(true);
          expect(text).toBe(`${String(hour).padStart(2, "0")}:00 UTC (${label} your time)`);
          expect(localHourLabel(hour, zone, ref)).toBe(label);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("formats a known example", () => {
    // 2026-01-15 01:00 UTC is 5:00 PM in Los Angeles (UTC-8)
    expect(hourWithLocalEquivalent(1, "America/Los_Angeles", new Date("2026-01-15T12:00:00Z"))).toMatch(
      /^01:00 UTC \(5:00\sPM your time\)$/,
    );
  });
});
