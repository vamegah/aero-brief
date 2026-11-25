import { describe, expect, it } from "vitest";
import type { EventSummary } from "../src/api/client";
import { assignIncidentKeys, withIncidentKeys } from "../src/lib/fallback-incident-keys";

function ev(type: string, airportId: string | null, occurredAt: string, incidentKey?: string): EventSummary {
  return { type, airportId, occurredAt, explanation: "x", ...(incidentKey !== undefined ? { incidentKey } : {}) };
}

const T = (h: number): string => `2026-01-02T${String(h).padStart(2, "0")}:00:00.000Z`;

describe("assignIncidentKeys", () => {
  it("pairs an ended event with the started event of the same airport", () => {
    const keys = assignIncidentKeys([ev("GROUND_STOP_ENDED", "SFO", T(11)), ev("GROUND_STOP_STARTED", "SFO", T(10))]);
    expect(keys[0]).toBe(keys[1]);
  });

  it("does not pair across airports", () => {
    const keys = assignIncidentKeys([ev("GROUND_STOP_STARTED", "SFO", T(10)), ev("GROUND_STOP_ENDED", "LAX", T(11))]);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("does not pair an end with a later start", () => {
    const keys = assignIncidentKeys([ev("GROUND_STOP_ENDED", "SFO", T(9)), ev("GROUND_STOP_STARTED", "SFO", T(10))]);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("pairs each end with the nearest earlier unpaired start", () => {
    const keys = assignIncidentKeys([
      ev("GROUND_STOP_STARTED", "SFO", T(1)),
      ev("GROUND_STOP_ENDED", "SFO", T(2)),
      ev("GROUND_STOP_STARTED", "SFO", T(3)),
      ev("GROUND_STOP_ENDED", "SFO", T(4)),
    ]);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).toBe(keys[3]);
    expect(keys[0]).not.toBe(keys[2]);
  });

  it("keeps provided keys and gives nationwide events a fallback key", () => {
    const keys = assignIncidentKeys([ev("NATIONWIDE_EVENT", null, T(5)), ev("GROUND_STOP_STARTED", "ATL", T(6), "given")]);
    expect(keys).toEqual([`fallback:nationwide:${T(5)}`, "given"]);
  });

  it("keeps identical events apart", () => {
    const keys = assignIncidentKeys([ev("GROUND_STOP_STARTED", "SFO", T(1)), ev("GROUND_STOP_STARTED", "SFO", T(1))]);
    expect(new Set(keys).size).toBe(2);
  });
});

describe("withIncidentKeys", () => {
  it("returns events that already have a key as the same objects", () => {
    const e = ev("GROUND_STOP_STARTED", "SFO", T(1), "k");
    expect(withIncidentKeys([e])[0]).toBe(e);
  });
});
