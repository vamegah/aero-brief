import { describe, expect, it } from "vitest";
import {
  AIRPORTS,
  ARTCC_NAMES,
  MONITORED_IDS,
  airportById,
  artccName,
  artccOf,
  isMonitoredId,
  type MonitoredId,
} from "../src/airports";

const CORE_30 = [
  "ATL", "BOS", "BWI", "CLT", "DCA", "DEN", "DFW", "DTW", "EWR", "FLL",
  "HNL", "IAD", "IAH", "JFK", "LAS", "LAX", "LGA", "MCO", "MDW", "MEM",
  "MIA", "MSP", "ORD", "PHL", "PHX", "SAN", "SEA", "SFO", "SLC", "TPA",
] as const;

const NEW_AIRPORTS = [
  "BWI", "CLT", "FLL", "HNL", "IAD", "LGA", "MDW", "PHL", "SAN", "TPA",
] as const;

const LEGACY_20 = [
  { id: "ATL", name: "Hartsfield-Jackson Atlanta International", artcc: "ZTL" },
  { id: "BOS", name: "Boston Logan International", artcc: "ZBW" },
  { id: "DCA", name: "Ronald Reagan Washington National", artcc: "ZDC" },
  { id: "DEN", name: "Denver International", artcc: "ZDV" },
  { id: "DFW", name: "Dallas/Fort Worth International", artcc: "ZFW" },
  { id: "DTW", name: "Detroit Metropolitan Wayne County", artcc: "ZOB" },
  { id: "EWR", name: "Newark Liberty International", artcc: "ZNY" },
  { id: "IAH", name: "George Bush Intercontinental Houston", artcc: "ZHU" },
  { id: "JFK", name: "John F. Kennedy International", artcc: "ZNY" },
  { id: "LAS", name: "Harry Reid International", artcc: "ZLA" },
  { id: "LAX", name: "Los Angeles International", artcc: "ZLA" },
  { id: "MCO", name: "Orlando International", artcc: "ZJX" },
  { id: "MEM", name: "Memphis International", artcc: "ZME" },
  { id: "MIA", name: "Miami International", artcc: "ZMA" },
  { id: "MSP", name: "Minneapolis-Saint Paul International", artcc: "ZMP" },
  { id: "ORD", name: "Chicago O'Hare International", artcc: "ZAU" },
  { id: "PHX", name: "Phoenix Sky Harbor International", artcc: "ZAB" },
  { id: "SEA", name: "Seattle-Tacoma International", artcc: "ZSE" },
  { id: "SFO", name: "San Francisco International", artcc: "ZOA" },
  { id: "SLC", name: "Salt Lake City International", artcc: "ZLC" },
] as const;

describe("airports", () => {
  it("is exactly the 30 Core 30 codes", () => {
    expect(AIRPORTS).toHaveLength(30);
    expect([...MONITORED_IDS].sort()).toEqual([...CORE_30].sort());
    expect(new Set(MONITORED_IDS).size).toBe(30);
  });

  it("has unique three-letter ids, each with a name and a known ARTCC", () => {
    for (const a of AIRPORTS) {
      expect(a.id).toMatch(/^[A-Z]{3}$/);
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.artcc).toMatch(/^Z[A-Z]{2}$/);
      expect(artccName(a.artcc)).not.toBe(a.artcc);
    }
  });

  it("covers 19 distinct ARTCCs, each with a display name", () => {
    const artccs = new Set(AIRPORTS.map((a) => a.artcc));
    expect(artccs.size).toBe(19);
    expect(artccs.has("ZHN")).toBe(true);
    expect(new Set(Object.keys(ARTCC_NAMES))).toEqual(artccs);
  });

  it("keeps the Legacy 20 with their old names and ARTCCs", () => {
    expect(LEGACY_20).toHaveLength(20);
    for (const legacy of LEGACY_20) {
      const { city, state, ...rest } = airportById(legacy.id);
      expect(rest).toEqual(legacy);
      expect(city.length).toBeGreaterThan(0);
      expect(state).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("gives every airport a city and a two-letter state", () => {
    for (const a of AIRPORTS) {
      expect(a.city.length).toBeGreaterThan(0);
      expect(a.state).toMatch(/^[A-Z]{2}$/);
    }
    expect(airportById("LAS")).toMatchObject({ city: "Las Vegas", state: "NV" });
    expect(airportById("HNL")).toMatchObject({ city: "Honolulu", state: "HI" });
    expect(airportById("DCA").city).toBe("Washington");
    expect(airportById("IAD").city).toBe("Washington");
  });

  it("adds exactly the New_Airports beyond the Legacy 20", () => {
    const legacyIds = new Set<string>(LEGACY_20.map((a) => a.id));
    const added = MONITORED_IDS.filter((id) => !legacyIds.has(id));
    expect([...added].sort()).toEqual([...NEW_AIRPORTS].sort());
  });

  it("uses the corrected ARTCCs for PHL and TPA", () => {
    expect(artccOf("PHL")).toBe("ZDC");
    expect(artccOf("TPA")).toBe("ZJX");
    expect(artccOf("HNL")).toBe("ZHN");
  });

  it("looks up airports and ARTCCs", () => {
    expect(isMonitoredId("ATL")).toBe(true);
    expect(isMonitoredId("BWI")).toBe(true);
    expect(isMonitoredId("FMY")).toBe(false);
    expect(isMonitoredId("CLE")).toBe(false);
    expect(airportById("JFK").artcc).toBe("ZNY");
    expect(artccOf("EWR")).toBe("ZNY");
    expect(artccName("ZNY")).toBe("New York");
    expect(artccName("ZZZ")).toBe("ZZZ");
  });

  it("types every Core 30 code as a MonitoredId", () => {
    const ids: readonly MonitoredId[] = CORE_30;
    expect(ids).toHaveLength(30);
  });
});
