import { AIRPORTS } from "@aerobrief/core/airports";
import { afterEach, beforeEach } from "vitest";
import type { AirportSummary, NationalStatusResponse } from "../../src/api/client";
import { DISPLAY_MODE_KEY } from "../../src/hooks/use-display-mode";

export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type OkStatus = Extract<NationalStatusResponse, { state: "ok" }>;

export const NOW = new Date("2026-01-02T12:00:00.000Z");
export const CAPTURED_AT = "2026-01-02T11:00:00.000Z";
/** Shown by TimeText when the display mode is "utc". Call `useUtcDisplayMode()` in the test file. */
export const CAPTURED_TEXT = "Jan 2, 2026, 11:00 UTC";

/** Registers hooks that pin the time Display_Setting to "utc" for each test, then clear it. */
export function useUtcDisplayMode(): void {
  beforeEach(() => {
    window.localStorage.setItem(DISPLAY_MODE_KEY, "utc");
  });
  afterEach(() => {
    window.localStorage.removeItem(DISPLAY_MODE_KEY);
  });
}

const LEADING_IDS: readonly string[] = [
  "ATL", "LAX", "ORD", "DFW", "DEN", "JFK", "SFO", "SEA", "LAS", "MCO",
  "EWR", "CLT", "PHX", "IAH", "MIA", "BOS", "MSP", "FLL", "DTW", "PHL",
];

/** Every monitored airport. The first 20 keep their old order so index-based tests stay stable. */
export const AIRPORT_IDS: readonly string[] = [
  ...LEADING_IDS,
  ...AIRPORTS.map((a) => a.id as string).filter((id) => !LEADING_IDS.includes(id)),
];

/** Number of monitored airports (30 for the Core 30). */
export const AIRPORT_COUNT: number = AIRPORTS.length;

export function makeAirports(): AirportSummary[] {
  return AIRPORT_IDS.map((id, i) => ({
    airportId: id,
    name: `Airport ${id}`,
    groundStop: i === 0 ? { reasonText: "thunderstorms" } : null,
  }));
}

/** Airports where the given ids have an active ground stop and every other airport has none. */
export function airportsWithStops(...ids: string[]): AirportSummary[] {
  return makeAirports().map((a) => ({ ...a, groundStop: ids.includes(a.airportId) ? { reasonText: "thunderstorms" } : null }));
}

export function okStatus(overrides: Partial<Omit<OkStatus, "state">> = {}): OkStatus {
  return {
    state: "ok",
    capturedAt: CAPTURED_AT,
    stale: false,
    airports: makeAirports(),
    nationwide: { active: false, count: 0, artccs: [], explanation: null },
    events: [],
    ...overrides,
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
