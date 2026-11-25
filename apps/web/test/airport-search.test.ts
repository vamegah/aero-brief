import { describe, expect, it } from "vitest";
import { matchesAirportSearch } from "../src/lib/airport-search";

const ATL = { airportId: "ATL", name: "Hartsfield-Jackson Atlanta International" };

describe("matchesAirportSearch", () => {
  it("matches the identifier ignoring case", () => {
    expect(matchesAirportSearch(ATL, "atl")).toBe(true);
    expect(matchesAirportSearch(ATL, "AT")).toBe(true);
  });

  it("matches the name as a substring ignoring case", () => {
    expect(matchesAirportSearch(ATL, "jackson")).toBe(true);
    expect(matchesAirportSearch(ATL, "ATLANTA")).toBe(true);
  });

  it("matches the city, from the summary or from the registry", () => {
    expect(matchesAirportSearch({ airportId: "LAS", name: "Harry Reid International" }, "las vegas")).toBe(true);
    expect(matchesAirportSearch({ airportId: "IAD", name: "Washington Dulles International", city: "Washington" }, "WASHINGTON")).toBe(true);
    expect(matchesAirportSearch({ airportId: "LAS", name: "Harry Reid International" }, "honolulu")).toBe(false);
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
