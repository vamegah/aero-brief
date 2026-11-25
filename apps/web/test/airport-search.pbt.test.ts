import fc from "fast-check";
import { describe, it } from "vitest";
import { matchesAirportSearch } from "../src/lib/airport-search";

const text = fc.string({ maxLength: 20 });

// Pad with whitespace and mix case so the predicate is exercised beyond plain substrings.
const randomCase = (s: string, flips: boolean[]): string =>
  [...s].map((ch, i) => (flips[i % Math.max(flips.length, 1)] ? ch.toUpperCase() : ch.toLowerCase())).join("");

describe("airport search properties", () => {
  // Feature: ui-improvements, Property 17: Airport search matches code, name or city case-insensitively
  // **Validates: Requirements 11.2**
  it("Property 17: matches exactly when the query is blank or a substring of code, name or city", () => {
    fc.assert(
      fc.property(
        fc.record({ airportId: text, name: text, city: text }),
        text,
        (airport, query) => {
          const needle = query.trim().toLowerCase();
          const expected =
            needle === "" ||
            [airport.airportId, airport.name, airport.city].some((f) => f.toLowerCase().includes(needle));
          return matchesAirportSearch(airport, query) === expected;
        },
      ),
      { numRuns: 200 },
    );
  });

  // Feature: ui-improvements, Property 17: Airport search matches code, name or city case-insensitively
  // **Validates: Requirements 11.2**
  it("Property 17: any slice of the code, name or city matches in any letter case", () => {
    fc.assert(
      fc.property(
        fc.record({ airportId: text, name: text, city: text }),
        fc.constantFrom("airportId", "name", "city"),
        fc.nat(20),
        fc.nat(20),
        fc.array(fc.boolean(), { minLength: 1, maxLength: 5 }),
        (airport, field, a, b, flips) => {
          const value = airport[field];
          const slice = randomCase(value.slice(Math.min(a, b), Math.max(a, b)), flips);
          return matchesAirportSearch(airport, slice);
        },
      ),
      { numRuns: 200 },
    );
  });
});
