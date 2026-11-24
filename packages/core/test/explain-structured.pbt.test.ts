import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { MONITORED_IDS } from "../src/airports";
import {
  NOT_AVAILABLE,
  NOT_YET_ANNOUNCED,
  REASON_NOT_PUBLISHED,
  explainStructured,
} from "../src/explain";
import type { Incident } from "../src/incidents";

const T0 = 1_700_000_000_000;
const iso = (n: number): string => new Date(n).toISOString();

const incidentArb: fc.Arbitrary<Incident> = fc.oneof(
  fc.record({
    incidentKey: fc.string({ minLength: 1, maxLength: 12 }),
    type: fc.constant("GROUND_STOP_STARTED" as const),
    airportId: fc.constantFrom(...MONITORED_IDS),
    start: fc.integer({ min: 0, max: 10_000_000 }),
    length: fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
  }).map(({ start, length, ...rest }): Incident => ({
    ...rest,
    startedAt: iso(T0 + start),
    endedAt: length === null ? null : iso(T0 + start + length),
    durationMs: length,
  })),
  fc.record({ incidentKey: fc.string({ minLength: 1, maxLength: 12 }), start: fc.integer({ min: 0, max: 10_000_000 }) }).map(
    ({ incidentKey, start }): Incident => ({
      incidentKey,
      type: "NATIONWIDE_EVENT",
      airportId: null,
      startedAt: iso(T0 + start),
      endedAt: null,
      durationMs: null,
    }),
  ),
);

const reasonArb = fc.oneof(
  fc.constant(null),
  fc.constantFrom("wind", "fog", "VOL", "WX:TS", "  Low Visibility ", "", "   ", "EQ:RWY"),
  fc.string({ maxLength: 20 }),
);
const expectedEndArb = fc.option(
  fc.integer({ min: 0, max: 20_000_000 }).map((n) => iso(T0 + n)),
  { nil: null },
);
const nowArb = fc.integer({ min: 0, max: 20_000_000 }).map((n) => new Date(T0 + n));

const RAW_CODES = /\b(VOL|WX|GDP|GS|EQ|RWY|TS|ZNY|ZDC)\b/;

describe("explainStructured properties", () => {
  // Feature: ui-improvements, Property 7: Structured explanation never has an empty field
  test("Property 7: all five fields are non-empty and fallbacks appear exactly when input is absent", () => {
    // **Validates: Requirements 3.1, 3.2, 3.3, 3.7**
    fc.assert(
      fc.property(incidentArb, reasonArb, expectedEndArb, nowArb, (incident, reason, expectedEnd, now) => {
        const out = explainStructured(incident, reason, expectedEnd, now);
        for (const v of Object.values(out)) expect(v.trim().length).toBeGreaterThan(0);
        expect(Object.keys(out).sort()).toEqual(
          ["likelyImpact", "nextUpdate", "source", "whatsHappening", "why"],
        );
        const noReason = reason === null || reason.trim() === "";
        expect(out.why === REASON_NOT_PUBLISHED).toBe(noReason);
        if (incident.endedAt === null) {
          expect(out.nextUpdate === NOT_YET_ANNOUNCED).toBe(expectedEnd === null);
          // Every generated start time is valid, so an estimate is always available.
          expect(out.likelyImpact).not.toBe(NOT_AVAILABLE);
        }
        // Raw FAA reason codes never leak into the output.
        if (reason !== null && ["VOL", "WX:TS", "EQ:RWY"].includes(reason)) {
          for (const v of Object.values(out)) expect(v).not.toContain(reason);
        }
        for (const v of Object.values(out)) expect(v).not.toMatch(RAW_CODES);
      }),
      { numRuns: 200 },
    );
  });

  // Feature: ui-improvements, Property 7: determinism (same inputs, same output)
  test("Property 7: output is deterministic", () => {
    // **Validates: Requirements 3.1**
    fc.assert(
      fc.property(incidentArb, reasonArb, expectedEndArb, nowArb, (i, r, e, n) => {
        expect(explainStructured(i, r, e, n)).toEqual(explainStructured(i, r, e, n));
      }),
      { numRuns: 100 },
    );
  });
});
