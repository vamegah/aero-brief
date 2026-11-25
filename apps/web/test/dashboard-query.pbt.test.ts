import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DASHBOARD_QUERY,
  decodeDashboardQuery,
  encodeDashboardQuery,
  type DashboardQueryState,
} from "../src/lib/dashboard-query";

const stateArb: fc.Arbitrary<DashboardQueryState> = fc.record({
  airportScope: fc.constantFrom("all" as const, "affected" as const),
  search: fc.string(),
  eventAirportId: fc.option(fc.string({ minLength: 1 }), { nil: null }),
  eventType: fc.option(fc.string({ minLength: 1 }), { nil: null }),
  eventState: fc.option(fc.constantFrom("active" as const, "ended" as const), { nil: null }),
});

describe("dashboard query properties", () => {
  // Feature: ui-improvements, Property 18: Dashboard query round-trips
  // **Validates: Requirements 11.7**
  it("Property 18: decode(encode(state)) equals state, with or without a leading '?'", () => {
    fc.assert(
      fc.property(stateArb, (state) => {
        const encoded = encodeDashboardQuery(state);
        expect(decodeDashboardQuery(encoded)).toEqual(state);
        expect(decodeDashboardQuery(`?${encoded}`)).toEqual(state);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: ui-improvements, Property 18: Dashboard query round-trips
  // **Validates: Requirements 11.7**
  it("Property 18: decode never throws and always yields a valid state", () => {
    fc.assert(
      fc.property(fc.string(), (search) => {
        const state = decodeDashboardQuery(search);
        expect(["all", "affected"]).toContain(state.airportScope);
        expect(state.eventAirportId).not.toBe("");
        expect(state.eventType).not.toBe("");
        expect([null, "active", "ended"]).toContain(state.eventState);
        expect(decodeDashboardQuery(encodeDashboardQuery(state))).toEqual(state);
      }),
      { numRuns: 200 },
    );
  });
});

describe("dashboard query examples", () => {
  it("encodes the default state as an empty string", () => {
    expect(encodeDashboardQuery(DEFAULT_DASHBOARD_QUERY)).toBe("");
  });

  it("ignores unknown params and bad values", () => {
    expect(decodeDashboardQuery("?foo=1&state=bogus&show=nope&airport=")).toEqual(DEFAULT_DASHBOARD_QUERY);
  });

  it("decodes known params", () => {
    expect(decodeDashboardQuery("?show=affected&q=las%20vegas&airport=LAS&type=GROUND_STOP&state=ended")).toEqual({
      airportScope: "affected",
      search: "las vegas",
      eventAirportId: "LAS",
      eventType: "GROUND_STOP",
      eventState: "ended",
    });
  });
});
