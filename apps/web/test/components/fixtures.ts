import type { AirportSummary, NationalStatusResponse } from "../../src/api/client";

export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type OkStatus = Extract<NationalStatusResponse, { state: "ok" }>;

export const NOW = new Date("2026-01-02T12:00:00.000Z");
export const CAPTURED_AT = "2026-01-02T11:00:00.000Z";
export const CAPTURED_TEXT = "2026-01-02 11:00 UTC";

export const AIRPORT_IDS: readonly string[] = [
  "ATL", "LAX", "ORD", "DFW", "DEN", "JFK", "SFO", "SEA", "LAS", "MCO",
  "EWR", "CLT", "PHX", "IAH", "MIA", "BOS", "MSP", "FLL", "DTW", "PHL",
];

export function makeAirports(): AirportSummary[] {
  return AIRPORT_IDS.map((id, i) => ({
    airportId: id,
    name: `Airport ${id}`,
    groundStop: i === 0 ? { reasonText: "thunderstorms" } : null,
  }));
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
