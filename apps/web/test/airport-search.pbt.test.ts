import fc from "fast-check";
import { describe, it } from "vitest";
import { matchesAirportSearch } from "../src/lib/airport-search";

const text = fc.string({ maxLength: 20 });
const word = fc.stringMatching(/^[a-z]{3,8}$/);

// Mix letter case so the predicate is exercised beyond plain lower-case text.
const randomCase = (s: string, flips: boolean[]): string =>
  [...s].map((ch, i) => (flips[i % Math.max(flips.length, 1)] ? ch.toUpperCase() : ch.toLowerCase())).join("");

describe("airport search properties", () => {
  // Feature: ui-improvements, Property 17: Airport search matches code prefixes and word starts case-insensitively
  // **Validates: Requirements 11.2**
  it("Property 17: any word-prefix of the name, city or code matches in any letter case", () => {
    fc.assert(
      fc.property(
        fc.record({ airportId: word, name: fc.array(word, { minLength: 1, maxLength: 3 }), city: fc.array(word, { minLength: 1, maxLength: 3 }) }),
        fc.constantFrom("airportId", "name", "city"),
        fc.nat(2),
        fc.nat(8),
        fc.array(fc.boolean(), { minLength: 1, maxLength: 5 }),
        (raw, field, wordIndex, len, flips) => {
          const airport = { airportId: raw.airportId, name: raw.name.join(" "), city: raw.city.join(" ") };
          const source = field === "airportId" ? [raw.airportId] : raw[field];
          const w = source[wordIndex % source.length] ?? "";
          const prefix = randomCase(w.slice(0, Math.max(1, len)), flips);
          return matchesAirportSearch(airport, prefix);
        },
      ),
      { numRuns: 200 },
    );
  });

  // Feature: ui-improvements, Property 17: Airport search matches code prefixes and word starts case-insensitively
  // **Validates: Requirements 11.2**
  it("Property 17: a query that only occurs in the middle of a word never matches", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z]{1,4}$/),
        fc.stringMatching(/^[a-z]{1,4}$/),
        fc.stringMatching(/^[a-z]{1,4}$/),
        (head, mid, tail) => {
          // Every letter of the fields is in a single word "head+mid+tail"; the code is a different letter set.
          const airport = { airportId: "9999", name: `${head}${mid}${tail}`, city: `${head}${mid}${tail}` };
          const query = mid;
          const full = `${head}${mid}${tail}`;
          // The query starts a word only if it is a prefix of the whole word.
          return matchesAirportSearch(airport, query) === full.startsWith(query);
        },
      ),
      { numRuns: 200 },
    );
  });

  // Feature: ui-improvements, Property 17: a blank query matches everything
  // **Validates: Requirements 11.2**
  it("Property 17: a blank query matches any airport", () => {
    fc.assert(
      fc.property(fc.record({ airportId: text, name: text, city: text }), fc.constantFrom("", " ", "   "), (airport, q) =>
        matchesAirportSearch(airport, q),
      ),
      { numRuns: 100 },
    );
  });
});
