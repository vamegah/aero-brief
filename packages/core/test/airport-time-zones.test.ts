import { describe, expect, it } from "vitest";
import { AIRPORTS, MONITORED_IDS } from "../src/airports";
import { AIRPORT_TIME_ZONES, airportTimeZone } from "../src/airport-time-zones";

describe("airport time zones", () => {
  it("has exactly one entry per monitored airport", () => {
    expect(Object.keys(AIRPORT_TIME_ZONES).sort()).toEqual([...MONITORED_IDS].sort());
    expect(AIRPORTS).toHaveLength(30);
  });

  it("uses a zone accepted by Intl.DateTimeFormat for every airport", () => {
    for (const id of MONITORED_IDS) {
      const tz = airportTimeZone(id);
      expect(() => new Intl.DateTimeFormat("en-US", { timeZone: tz })).not.toThrow();
      expect(new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone).toBe(tz);
    }
  });

  it("maps known airports to the expected zones", () => {
    expect(airportTimeZone("PHX")).toBe("America/Phoenix");
    expect(airportTimeZone("HNL")).toBe("Pacific/Honolulu");
    expect(airportTimeZone("DTW")).toBe("America/Detroit");
    expect(airportTimeZone("SLC")).toBe("America/Denver");
    expect(airportTimeZone("ORD")).toBe("America/Chicago");
  });
});
