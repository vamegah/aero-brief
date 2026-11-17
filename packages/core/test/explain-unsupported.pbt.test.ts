import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { UnsupportedEventTypeError, explain } from "../src/explain";
import type { DetectedEvent } from "../src/change-detector";
import { airportIdArb, genericStringArb } from "./arbitraries";

const SUPPORTED = new Set(["GROUND_STOP_STARTED", "GROUND_STOP_ENDED", "NATIONWIDE_EVENT"]);

/** Type strings that are not supported, including Object.prototype member names. */
const unsupportedTypeArb: fc.Arbitrary<string> = fc
  .oneof(
    genericStringArb,
    fc.stringMatching(/^[A-Z_]{1,30}$/),
    fc.constantFrom(
      "toString",
      "constructor",
      "__proto__",
      "hasOwnProperty",
      "valueOf",
      "ground_stop_started",
      "GROUND_STOP_STARTED ",
      "GROUND_STOP_UPDATED",
    ),
  )
  .filter((s) => !SUPPORTED.has(s));

const unsupportedEventArb: fc.Arbitrary<DetectedEvent> = fc
  .tuple(
    unsupportedTypeArb,
    airportIdArb,
    fc.option(genericStringArb, { nil: null }),
    fc.array(fc.string({ maxLength: 4 }), { maxLength: 5 }),
  )
  .map(
    ([type, airportId, reason, affectedArtccs]) =>
      ({ type, airportId, reason, affectedArtccs, count: affectedArtccs.length }) as unknown as DetectedEvent,
  );

describe("Property 15: Unsupported event types are rejected", () => {
  // Feature: aerobrief, Property 15: Unsupported event types are rejected
  // **Validates: Requirements 5.10**
  it("explain throws UnsupportedEventTypeError and returns no Explanation", () => {
    fc.assert(
      fc.property(unsupportedEventArb, (event) => {
        let result: unknown;
        let thrown: unknown;
        try {
          result = explain(event);
        } catch (err) {
          thrown = err;
        }
        expect(result).toBeUndefined();
        expect(thrown).toBeInstanceOf(UnsupportedEventTypeError);
        expect((thrown as UnsupportedEventTypeError).eventType).toBe((event as { type: string }).type);
      }),
      { numRuns: 100 },
    );
  });
});
