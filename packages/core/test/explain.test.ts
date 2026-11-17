import { describe, expect, test } from "vitest";
import { ARTCC_NAMES } from "../src/airports";
import type { DetectedEvent, GroundStopEvent } from "../src/change-detector";
import { UnsupportedEventTypeError, explain } from "../src/explain";

const AT = "2024-06-01T12:00:00.000Z";

function gs(type: GroundStopEvent["type"], reason: string | null): GroundStopEvent {
  return { type, airportId: "JFK", occurredAt: AT, faaEventId: "faa:1", reason };
}

const ALL_CENTERS = Object.keys(ARTCC_NAMES).sort();

describe("ground stop templates", () => {
  test("STARTED with a known reason", () => {
    expect(explain(gs("GROUND_STOP_STARTED", "wind"))).toBe(
      "A ground stop is in effect at John F. Kennedy International (JFK). Flights bound for this airport are being held at their departure airports. The FAA says the cause is strong winds.",
    );
  });

  test("ENDED with a known reason", () => {
    expect(explain(gs("GROUND_STOP_ENDED", "fog"))).toBe(
      "The ground stop at John F. Kennedy International (JFK) has ended. Flights can depart for this airport again, although delays may continue for a while. The FAA says the cause is fog.",
    );
  });
});

describe("cause sentence", () => {
  test("matches case-insensitively after trimming", () => {
    expect(explain(gs("GROUND_STOP_STARTED", "  Low Visibility "))).toContain(
      "The FAA says the cause is poor visibility.",
    );
  });

  test("null reason gives the not-given sentence", () => {
    expect(explain(gs("GROUND_STOP_STARTED", null))).toMatch(
      /The FAA has not given a reason AeroBrief can explain\.$/,
    );
  });

  test("unknown reason is never echoed", () => {
    const text = explain(gs("GROUND_STOP_ENDED", "alien invasion"));
    expect(text).not.toContain("alien");
    expect(text).toMatch(/The FAA has not given a reason AeroBrief can explain\.$/);
  });

  test("partial matches are not translated", () => {
    expect(explain(gs("GROUND_STOP_STARTED", "wind shear"))).toContain("has not given a reason");
  });

  test.each([
    "wind", "weather", "thunderstorms", "low ceilings", "low visibility", "fog", "snow", "ice",
    "airport volume", "volume", "runway construction", "equipment outage",
  ])("dictionary entry %s is translated", (reason) => {
    const text = explain(gs("GROUND_STOP_STARTED", reason));
    expect(text).toContain("The FAA says the cause is ");
    expect(text).not.toContain("has not given a reason");
  });
});

describe("nationwide", () => {
  test("three centers, no remainder", () => {
    const e: DetectedEvent = {
      type: "NATIONWIDE_EVENT",
      occurredAt: AT,
      count: 3,
      affectedArtccs: ["ZLA", "ZNY", "ZTL"],
    };
    expect(explain(e)).toBe(
      "Ground stops are active at airports served by 3 of the FAA's regional air traffic control centers, which points to widespread disruption. Affected centers include Los Angeles (ZLA), New York (ZNY), Atlanta (ZTL).",
    );
  });

  test("exactly 6 centers has no 'more' clause", () => {
    const e: DetectedEvent = {
      type: "NATIONWIDE_EVENT",
      occurredAt: AT,
      count: 6,
      affectedArtccs: ALL_CENTERS.slice(0, 6),
    };
    expect(explain(e)).not.toContain("more");
  });

  test("all 18 centers list 6 and ', and 12 more.'", () => {
    const e: DetectedEvent = {
      type: "NATIONWIDE_EVENT",
      occurredAt: AT,
      count: 18,
      affectedArtccs: ALL_CENTERS,
    };
    const text = explain(e);
    expect(text.endsWith(", and 12 more.")).toBe(true);
    expect(text.match(/\(Z[A-Z]{2}\)/g)).toHaveLength(6);
    expect(text.length).toBeLessThanOrEqual(500);
  });
});

describe("explanation length", () => {
  test("ground stop explanations are non-empty and at most 500 characters", () => {
    for (const type of ["GROUND_STOP_STARTED", "GROUND_STOP_ENDED"] as const) {
      const text = explain(gs(type, "alien invasion"));
      expect(text.length).toBeGreaterThan(0);
      expect(text.length).toBeLessThanOrEqual(500);
    }
  });
});

describe("unsupported types", () => {
  test("throws UnsupportedEventTypeError", () => {
    const bad = { type: "BOGUS", occurredAt: AT } as unknown as DetectedEvent;
    expect(() => explain(bad)).toThrow(UnsupportedEventTypeError);
  });

  test("inherited object keys are not treated as types", () => {
    const bad = { type: "constructor" } as unknown as DetectedEvent;
    expect(() => explain(bad)).toThrow(UnsupportedEventTypeError);
  });
});
