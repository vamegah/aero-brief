import { describe, expect, test } from "vitest";
import type { GroundStopEvent, NationwideEvent } from "../src/change-detector";
import { dedupKey, eventKey } from "../src/event-keys";

const started: GroundStopEvent = {
  type: "GROUND_STOP_STARTED",
  airportId: "JFK",
  occurredAt: "2024-01-01T00:00:00.000Z",
  faaEventId: "faa-123",
  reason: null,
};
const ended: GroundStopEvent = { ...started, type: "GROUND_STOP_ENDED" };
const nationwide: NationwideEvent = {
  type: "NATIONWIDE_EVENT",
  occurredAt: "2024-01-01T00:00:00.000Z",
  count: 3,
  affectedArtccs: ["ZNY", "ZDC", "ZBW"],
};

describe("eventKey", () => {
  test("ground stop key is the FAA event id regardless of snapshot id", () => {
    expect(eventKey(started, null)).toBe("faa-123");
    expect(eventKey(started, "snap-a")).toBe("faa-123");
  });

  test("nationwide key uses the previous snapshot id, or 'none'", () => {
    expect(eventKey(nationwide, "snap-a")).toBe("NATIONWIDE:snap-a");
    expect(eventKey(nationwide, null)).toBe("NATIONWIDE:none");
  });

  test("STARTED and ENDED of the same faaEventId share an eventKey", () => {
    expect(eventKey(started, "p")).toBe(eventKey(ended, "p"));
  });
});

describe("dedupKey", () => {
  test("format is eventKey:type:userId", () => {
    expect(dedupKey(started, null, "u1")).toBe("faa-123:GROUND_STOP_STARTED:u1");
    expect(dedupKey(nationwide, "s", "u1")).toBe("NATIONWIDE:s:NATIONWIDE_EVENT:u1");
  });

  test("STARTED and ENDED of the same event differ", () => {
    expect(dedupKey(started, null, "u1")).not.toBe(dedupKey(ended, null, "u1"));
  });

  test("different users differ", () => {
    expect(dedupKey(started, null, "u1")).not.toBe(dedupKey(started, null, "u2"));
  });
});
