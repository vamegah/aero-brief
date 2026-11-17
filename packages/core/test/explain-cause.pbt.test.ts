import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { GroundStopEvent } from "../src/change-detector";
import { explain } from "../src/explain";
import { airportIdArb, isoTimestampArb, tokenArb } from "./arbitraries";

const NO_REASON_SENTENCE = "The FAA has not given a reason AeroBrief can explain.";

/** Dictionary from requirements 5.5, written independently of the source. */
const DICTIONARY: ReadonlyArray<readonly [string, string]> = [
  ["wind", "strong winds"],
  ["weather", "bad weather"],
  ["thunderstorms", "thunderstorms in the area"],
  ["low ceilings", "clouds hanging too low for safe landings"],
  ["low visibility", "poor visibility"],
  ["fog", "fog"],
  ["snow", "snow"],
  ["ice", "ice on the runways or aircraft"],
  ["airport volume", "more flights than the airport can handle at once"],
  ["volume", "more flights than the airport can handle at once"],
  ["runway construction", "construction work on a runway"],
  ["equipment outage", "an equipment failure"],
];
const KEYS = new Set(DICTIONARY.map(([k]) => k));

const typeArb = fc.constantFrom<GroundStopEvent["type"]>("GROUND_STOP_STARTED", "GROUND_STOP_ENDED");

function eventArb(reason: fc.Arbitrary<string | null>): fc.Arbitrary<GroundStopEvent> {
  return fc.record({
    type: typeArb,
    airportId: airportIdArb,
    occurredAt: isoTimestampArb,
    faaEventId: tokenArb.map((t) => `faa:${t}`),
    reason,
  });
}

/** Dictionary key in random letter case with random surrounding whitespace. */
const matchingReasonArb: fc.Arbitrary<{ key: string; translation: string; reason: string }> = fc
  .tuple(
    fc.constantFrom(...DICTIONARY),
    fc.infiniteStream(fc.boolean()),
    fc.stringMatching(/^[ \t\n]{0,4}$/),
    fc.stringMatching(/^[ \t\n]{0,4}$/),
  )
  .map(([[key, translation], flips, pre, post]) => {
    const it = flips[Symbol.iterator]();
    const cased = [...key].map((c) => (it.next().value ? c.toUpperCase() : c.toLowerCase())).join("");
    return { key, translation, reason: `${pre}${cased}${post}` };
  });

/** Reasons that cannot match: contain a unique marker never present in the output. */
const unknownReasonArb: fc.Arbitrary<string> = fc.oneof(
  tokenArb.map((t) => `~${t}~`),
  fc.constantFrom(...DICTIONARY).chain(([k]) => tokenArb.map((t) => `${k} ~${t}~`)),
  fc.constantFrom(...DICTIONARY).chain(([k]) => tokenArb.map((t) => `~${t}~ ${k}`)),
);

describe("Property 14: Cause text", () => {
  // Feature: aerobrief, Property 14: Cause text
  it("includes the translation for any dictionary reason in any case with surrounding whitespace", () => {
    // **Validates: Requirements 5.5, 5.6, 5.7**
    fc.assert(
      fc.property(
        matchingReasonArb.chain((m) => eventArb(fc.constant(m.reason)).map((e) => ({ e, m }))),
        ({ e, m }) => {
          const text = explain(e);
          expect(text).toContain(`The FAA says the cause is ${m.translation}.`);
          expect(text).not.toContain(NO_REASON_SENTENCE);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("uses the no-reason sentence and hides raw text for null or unknown reasons", () => {
    // **Validates: Requirements 5.5, 5.6, 5.7**
    fc.assert(
      fc.property(
        eventArb(fc.oneof(fc.constant(null), unknownReasonArb)).filter(
          (e) => e.reason === null || !KEYS.has(e.reason.trim().toLowerCase()),
        ),
        (e) => {
          const text = explain(e);
          expect(text).toContain(NO_REASON_SENTENCE);
          expect(text).not.toContain("The FAA says the cause is");
          if (e.reason !== null) expect(text).not.toContain(e.reason.trim());
        },
      ),
      { numRuns: 200 },
    );
  });
});
