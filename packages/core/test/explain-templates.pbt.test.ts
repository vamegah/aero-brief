import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { ARTCC_NAMES, airportById } from "../src/airports";
import type { DetectedEvent, GroundStopEvent, NationwideEvent } from "../src/change-detector";
import { explain } from "../src/explain";
import { airportIdArb, genericStringArb, isoTimestampArb, tokenArb } from "./arbitraries";

const RUNS = { numRuns: 100 };

const reasonArb: fc.Arbitrary<string | null> = fc.oneof(
  fc.constant(null),
  genericStringArb,
  fc.constantFrom("wind", "Weather", " FOG ", "Low Ceilings", "volume", "equipment outage"),
);

const groundStopEventArb = (type: GroundStopEvent["type"]): fc.Arbitrary<GroundStopEvent> =>
  fc.record({
    type: fc.constant(type),
    airportId: airportIdArb,
    occurredAt: isoTimestampArb,
    faaEventId: tokenArb.map((t) => `faa:${t}`),
    reason: reasonArb,
  });

const nationwideEventArb: fc.Arbitrary<NationwideEvent> = fc
  .subarray(Object.keys(ARTCC_NAMES).sort(), { minLength: 3 })
  .chain((centers) =>
    fc.record({
      type: fc.constant<"NATIONWIDE_EVENT">("NATIONWIDE_EVENT"),
      occurredAt: isoTimestampArb,
      count: fc.constant(centers.length),
      affectedArtccs: fc.constant(centers),
    }),
  );

const startedArb = groundStopEventArb("GROUND_STOP_STARTED");
const endedArb = groundStopEventArb("GROUND_STOP_ENDED");

const eventArb: fc.Arbitrary<DetectedEvent> = fc.oneof(startedArb, endedArb, nationwideEventArb);

const FORBIDDEN = [
  "GROUND_STOP_STARTED",
  "GROUND_STOP_ENDED",
  "NATIONWIDE_EVENT",
  "faaEventId",
  "airportId",
  "occurredAt",
  "affectedArtccs",
  "idSource",
  "undefined",
  "null",
  "[object",
];

/** Remove everything event-specific so only the template skeleton remains. */
function skeleton(e: DetectedEvent, text: string): string {
  if (e.type === "NATIONWIDE_EVENT") {
    return text
      .replace(/served by \d+ of/, "served by N of")
      .replace(/Affected centers include .*$/, "Affected centers include LIST");
  }
  const a = airportById(e.airportId);
  return text.replace(`${a.name} (${a.id})`, "AIRPORT").replace(/ The FAA (says|has not).*$/, " CAUSE");
}

describe("Property 35: One user-facing template per Event type", () => {
  /** **Validates: Requirements 5.1** */
  test("explain is deterministic and never leaks internal identifiers", () => {
    fc.assert(
      fc.property(eventArb, (e) => {
        const text = explain(e);
        expect(explain(e)).toBe(text);
        expect(text.length).toBeGreaterThanOrEqual(1);
        expect(text.length).toBeLessThanOrEqual(500);
        for (const bad of FORBIDDEN) expect(text).not.toContain(bad);
        if (e.type !== "NATIONWIDE_EVENT") expect(text).not.toContain(e.faaEventId);
      }),
      RUNS,
    );
  });

  /** **Validates: Requirements 5.1** */
  test("two events of the same type share one template skeleton", () => {
    for (const arb of [startedArb, endedArb, nationwideEventArb]) {
      fc.assert(
        fc.property(arb, arb, (a, b) => {
          expect(skeleton(a, explain(a))).toBe(skeleton(b, explain(b)));
        }),
        RUNS,
      );
    }
  });

  /** **Validates: Requirements 5.1** */
  test("the three event types use three distinct templates", () => {
    fc.assert(
      fc.property(startedArb, endedArb, nationwideEventArb, (s, en, n) => {
        const skeletons = new Set([skeleton(s, explain(s)), skeleton(en, explain(en)), skeleton(n, explain(n))]);
        expect(skeletons.size).toBe(3);
      }),
      RUNS,
    );
  });
});
