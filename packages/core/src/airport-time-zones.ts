import type { MonitoredId } from "./airports";

/**
 * IANA time zone per Core 30 airport. Typed as a full Record so a missing
 * airport fails typecheck.
 */
export const AIRPORT_TIME_ZONES: Readonly<Record<MonitoredId, string>> = {
  ATL: "America/New_York",
  BOS: "America/New_York",
  BWI: "America/New_York",
  CLT: "America/New_York",
  DCA: "America/New_York",
  DEN: "America/Denver",
  DFW: "America/Chicago",
  DTW: "America/Detroit",
  EWR: "America/New_York",
  FLL: "America/New_York",
  HNL: "Pacific/Honolulu",
  IAD: "America/New_York",
  IAH: "America/Chicago",
  JFK: "America/New_York",
  LAS: "America/Los_Angeles",
  LAX: "America/Los_Angeles",
  LGA: "America/New_York",
  MCO: "America/New_York",
  MDW: "America/Chicago",
  MEM: "America/Chicago",
  MIA: "America/New_York",
  MSP: "America/Chicago",
  ORD: "America/Chicago",
  PHL: "America/New_York",
  PHX: "America/Phoenix",
  SAN: "America/Los_Angeles",
  SEA: "America/Los_Angeles",
  SFO: "America/Los_Angeles",
  SLC: "America/Denver",
  TPA: "America/New_York",
};

export function airportTimeZone(id: MonitoredId): string {
  return AIRPORT_TIME_ZONES[id];
}
