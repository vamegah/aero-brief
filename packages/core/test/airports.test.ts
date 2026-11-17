import { describe, expect, it } from "vitest";
import {
  AIRPORTS,
  ARTCC_NAMES,
  MONITORED_IDS,
  airportById,
  artccName,
  artccOf,
  isMonitoredId,
} from "../src/airports";

describe("airports", () => {
  it("has 20 unique ids, each with a name and ARTCC", () => {
    expect(AIRPORTS).toHaveLength(20);
    expect(MONITORED_IDS).toHaveLength(20);
    expect(new Set(MONITORED_IDS).size).toBe(20);
    for (const a of AIRPORTS) {
      expect(a.id).toMatch(/^[A-Z]{3}$/);
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.artcc).toMatch(/^Z[A-Z]{2}$/);
    }
  });

  it("covers 18 distinct ARTCCs, each with a display name", () => {
    const artccs = new Set(AIRPORTS.map((a) => a.artcc));
    expect(artccs.size).toBe(18);
    expect(new Set(Object.keys(ARTCC_NAMES))).toEqual(artccs);
  });

  it("looks up airports and ARTCCs", () => {
    expect(isMonitoredId("ATL")).toBe(true);
    expect(isMonitoredId("FMY")).toBe(false);
    expect(airportById("JFK").artcc).toBe("ZNY");
    expect(artccOf("EWR")).toBe("ZNY");
    expect(artccName("ZNY")).toBe("New York");
    expect(artccName("ZZZ")).toBe("ZZZ");
  });
});
