import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { AIRPORTS, ARTCC_NAMES, airportById, artccName } from "../src/airports";
import type { DetectedEvent, GroundStopEvent, NationwideEvent } from "../src/change-detector";
import { explain } from "../src/explain";
import { airportIdArb, genericStringArb, isoTimestampArb, tokenArb } from "./arbitraries";

/**
 * Feature: aerobrief, Property 13: Explanation content and form
 * For any valid Event, the Explanation has 1 to 500 characters and contains a
 * non-whitespace character. Ground stop Events contain the airport's full name.
 * NATIONWIDE_EVENT contains `count` as a whole number. Every airport or ARTCC
 * code in the text is immediately preceded by its plain-language name.
 *
 * **Validates: Requirements 5.2, 5.3, 5.4, 5.9**
 */

const NUM_RUNS = 200;

const KNOWN_REASONS = ["wind", "weather", "thunderstorms", "low ceilings", "fog", "snow", "ice", "volume", "equipment outage"];
const reasonArb: fc.Arbitrary<string | null> = fc.oneof(
  fc.constant(null),
  fc.constantFrom(...KNOWN_REASONS),
  genericStringArb,
);

const groundStopEventArb: fc.Arbitrary<GroundStopEvent> = fc
  .record({
    type: fc.constantFrom<GroundStopEvent["type"]>("GROUND_STOP_STARTED", "GROUND_STOP_ENDED"),
    airportId: airportIdArb,
    occurredAt: isoTimestampArb,
    faaEventId: tokenArb,
    reason: reasonArb,
  });

const ALL_ARTCCS = Object.keys(ARTCC_NAMES);

const nationwideEventArb: fc.Arbitrary<NationwideEvent> = fc
  .subarray(ALL_ARTCCS, { minLength: 3 })
  .chain((artccs) =>
    fc.record({
      type: fc.constant<"NATIONWIDE_EVENT">("NATIONWIDE_EVENT"),
      occurredAt: isoTimestampArb,
      count: fc.constant(artccs.length),
      affectedArtccs: fc.constant([...artccs].sort()),
    }),
  );

const eventArb: fc.Arbitrary<DetectedEvent> = fc.oneof(groundStopEventArb, nationwideEventArb);

const KNOWN_CODES: readonly string[] = [...AIRPORTS.map((a) => a.id), ...ALL_ARTCCS];

function nameOfCode(code: string): string {
  const airport = AIRPORTS.find((a) => a.id === code);
  return airport !== undefined ? airport.name : artccName(code);
}

/** Every occurrence of a known code as a whole word must read "<name> (<code>)". */
function codesPrecededByName(text: string): boolean {
  for (const code of KNOWN_CODES) {
    const re = new RegExp(`(?<![A-Za-z0-9])${code}(?![A-Za-z0-9])`, "g");
    for (const m of text.matchAll(re)) {
      const before = text.slice(0, m.index);
      if (!before.endsWith(`${nameOfCode(code)} (`)) return false;
      if (text[m.index + code.length] !== ")") return false;
    }
  }
  return true;
}

describe("Property 13: Explanation content and form", () => {
  it("has 1 to 500 characters and a non-whitespace character", () => {
    fc.assert(
      fc.property(eventArb, (e) => {
        const text = explain(e);
        expect(text.length).toBeGreaterThanOrEqual(1);
        expect(text.length).toBeLessThanOrEqual(500);
        expect(/\S/.test(text)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("ground stop explanations contain the airport's full name", () => {
    fc.assert(
      fc.property(groundStopEventArb, (e) => {
        expect(explain(e)).toContain(airportById(e.airportId).name);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("nationwide explanations contain count as a whole number", () => {
    fc.assert(
      fc.property(nationwideEventArb, (e) => {
        const text = explain(e);
        const re = new RegExp(`(?<![\\d.])${e.count}(?![\\d])`);
        expect(re.test(text)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("every airport or ARTCC code is immediately preceded by its name", () => {
    fc.assert(
      fc.property(eventArb, (e) => {
        expect(codesPrecededByName(explain(e))).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("ground stop explanations include the airport code, so the name check is exercised", () => {
    const e: GroundStopEvent = {
      type: "GROUND_STOP_STARTED",
      airportId: "ATL",
      occurredAt: "2026-01-01T00:00:00.000Z",
      faaEventId: "x",
      reason: null,
    };
    const text = explain(e);
    expect(text).toContain("Hartsfield-Jackson Atlanta International (ATL)");
  });
});
