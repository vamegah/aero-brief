import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { MONITORED_IDS, airportById } from "../src/airports";
import { explain } from "../src/explain";

/**
 * Feature: core30-limits, Property 7: Explanations name the airport and show no raw reason
 * For any monitored airport and any FAA reason string (or null), a ground stop explanation
 * contains the registry name and code. An untranslatable reason is never echoed and the
 * explanation ends with the fixed unknown-reason sentence.
 *
 * **Validates: Requirements 5.7**
 */
const NO_REASON = "The FAA has not given a reason AeroBrief can explain.";
const KNOWN = new Set([
  "wind", "weather", "thunderstorms", "low ceilings", "low visibility", "fog", "snow", "ice",
  "airport volume", "volume", "runway construction", "equipment outage",
]);

const idArb = fc.constantFrom(...MONITORED_IDS);
const typeArb = fc.constantFrom<"GROUND_STOP_STARTED" | "GROUND_STOP_ENDED">(
  "GROUND_STOP_STARTED",
  "GROUND_STOP_ENDED",
);
const reasonArb = fc.oneof(
  fc.constant(null),
  fc.string({ maxLength: 40 }),
  fc.constantFrom(...KNOWN).map((r) => ` ${r.toUpperCase()} `),
  fc.constantFrom(...KNOWN),
);

describe("Property 7: explanations name the airport and show no raw reason", () => {
  it("includes name and code, and never echoes an unknown reason", () => {
    fc.assert(
      fc.property(idArb, typeArb, reasonArb, (airportId, type, reason) => {
        const text = explain({
          type,
          airportId,
          occurredAt: "2024-06-01T12:00:00.000Z",
          faaEventId: "faa:1",
          reason,
        });
        const a = airportById(airportId);
        expect(text).toContain(a.name);
        expect(text).toContain(`(${a.id})`);
        const known = reason !== null && KNOWN.has(reason.trim().toLowerCase());
        if (!known) {
          expect(text.endsWith(NO_REASON)).toBe(true);
          const sentence = text.slice(0, -NO_REASON.length);
          const r = reason?.trim();
          if (r && r.length >= 3 && !a.name.includes(r) && !sentence.includes(r)) {
            expect(text).not.toContain(r);
          }
        } else {
          expect(text.endsWith(NO_REASON)).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });
});
