import { AIRPORTS } from "@aerobrief/core/airports";
import { describe, expect, it } from "vitest";
import { matchesAirportSearch, rankAirportMatches } from "../src/lib/airport-search";

const ATL = { airportId: "ATL", name: "Hartsfield-Jackson Atlanta International" };

const idsFor = (query: string): string[] =>
  AIRPORTS.filter((a) => matchesAirportSearch({ airportId: a.id, name: a.name, city: a.city }, query)).map((a) => a.id);

describe("matchesAirportSearch", () => {
  it("matches the start of the identifier ignoring case", () => {
    expect(matchesAirportSearch(ATL, "atl")).toBe(true);
    expect(matchesAirportSearch(ATL, "AT")).toBe(true);
    expect(matchesAirportSearch(ATL, "tl")).toBe(false);
  });

  it("matches the start of any word in the name, ignoring case", () => {
    expect(matchesAirportSearch(ATL, "jackson")).toBe(true);
    expect(matchesAirportSearch(ATL, "ATLANTA")).toBe(true);
    expect(matchesAirportSearch(ATL, "int")).toBe(true);
  });

  it("does not match text found only in the middle of a word", () => {
    expect(matchesAirportSearch(ATL, "lanta")).toBe(false);
    expect(matchesAirportSearch(ATL, "son")).toBe(false);
  });

  it("matches the city, from the summary or from the registry", () => {
    expect(matchesAirportSearch({ airportId: "LAS", name: "Harry Reid International" }, "las vegas")).toBe(true);
    expect(matchesAirportSearch({ airportId: "IAD", name: "Washington Dulles International", city: "Washington" }, "WASHINGTON")).toBe(true);
    expect(matchesAirportSearch({ airportId: "LAS", name: "Harry Reid International" }, "honolulu")).toBe(false);
  });

  it("treats / - ( ) , . and repeated spaces as word separators", () => {
    expect(matchesAirportSearch({ airportId: "DFW", name: "Dallas/Fort Worth International", city: "x" }, "fort worth")).toBe(true);
    expect(matchesAirportSearch({ airportId: "HNL", name: "Daniel K. Inouye (Honolulu)", city: "x" }, "honolulu")).toBe(true);
    expect(matchesAirportSearch(ATL, "  atlanta   inter ")).toBe(true);
    expect(matchesAirportSearch(ATL, "jackson-atlanta")).toBe(true);
  });

  it("ignores leading and trailing spaces", () => {
    expect(matchesAirportSearch(ATL, "  atl  ")).toBe(true);
  });

  it("matches everything for an empty or blank query", () => {
    expect(matchesAirportSearch(ATL, "")).toBe(true);
    expect(matchesAirportSearch(ATL, "   ")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(matchesAirportSearch(ATL, "LAX")).toBe(false);
  });
});

describe("matchesAirportSearch against the Core 30 registry", () => {
  it('"LAS" and "las" find only Las Vegas, not Dallas or Charlotte Douglas', () => {
    expect(idsFor("LAS")).toEqual(["LAS"]);
    expect(idsFor("las")).toEqual(["LAS"]);
  });

  it('"las vegas" finds LAS', () => {
    expect(idsFor("las vegas")).toEqual(["LAS"]);
  });

  it('"dal" finds DFW', () => {
    expect(idsFor("dal")).toEqual(["DFW"]);
  });

  it('"fort" finds DFW and FLL', () => {
    expect(idsFor("fort").sort()).toEqual(["DFW", "FLL"]);
  });

  it('"new york" finds JFK and LGA only (EWR is Newark)', () => {
    expect(idsFor("new york").sort()).toEqual(["JFK", "LGA"]);
  });

  it('"wash" finds BWI, DCA and IAD', () => {
    expect(idsFor("wash").sort()).toEqual(["BWI", "DCA", "IAD"]);
  });

  it('"CLT" finds only CLT', () => {
    expect(idsFor("CLT")).toEqual(["CLT"]);
  });

  it('"ch" finds CLT, ORD and MDW', () => {
    const ids = idsFor("ch");
    expect(ids).toEqual(expect.arrayContaining(["CLT", "ORD", "MDW"]));
    expect(ids).not.toContain("LAS");
  });
});

describe("rankAirportMatches", () => {
  const items = [
    { airportId: "AAA", name: "Lasting Field" },
    { airportId: "LASX", name: "Other" },
    { airportId: "LAS", name: "Harry Reid" },
    { airportId: "BBB", name: "Las Palmas" },
  ];

  it("puts the exact code first, then code prefixes, then word matches, keeping order within groups", () => {
    const ranked = rankAirportMatches(items, "las", (x) => x);
    expect(ranked.map((x) => x.airportId)).toEqual(["LAS", "LASX", "AAA", "BBB"]);
  });

  it("keeps the input order for a blank query", () => {
    expect(rankAirportMatches(items, "  ", (x) => x)).toEqual(items);
  });
});
