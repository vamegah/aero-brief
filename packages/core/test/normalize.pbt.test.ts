import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { MONITORED_IDS } from "../src/airports";
import { normalizeResponse } from "../src/normalize";
import { faaResponseArb, isoTimestampArb, snapshotArb } from "./arbitraries";

const SORTED_IDS = [...MONITORED_IDS].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

describe("normalizeResponse properties", () => {
  // Feature: aerobrief, Property 2: Normalization yields exactly the 20 monitored airports
  test("Property 2: Normalization yields exactly the 20 monitored airports", () => {
    /** **Validates: Requirements 2.2, 2.4, 2.5** */
    fc.assert(
      fc.property(
        faaResponseArb,
        isoTimestampArb,
        fc.uuid(),
        fc.option(snapshotArb, { nil: null }),
        (faa, capturedAt, id, previous) => {
          const snap = normalizeResponse(faa, capturedAt, id, previous);

          // Exactly 20 entries, one per monitored id, sorted by id.
          expect(snap.airports).toHaveLength(20);
          expect(snap.airports.map((a) => a.airportId)).toEqual(SORTED_IDS);

          // Non-monitored ids never appear.
          const monitored = new Set<string>(MONITORED_IDS);
          for (const a of snap.airports) expect(monitored.has(a.airportId)).toBe(true);

          // Non-null groundStop iff some response entry for that airport had one.
          for (const a of snap.airports) {
            const hasStop = faa.some(
              (e) => e.airportId === a.airportId && e.groundStop !== null && e.groundStop !== undefined,
            );
            expect(a.groundStop !== null).toBe(hasStop);
          }

          expect(snap.id).toBe(id);
          expect(snap.capturedAt).toBe(capturedAt);
        },
      ),
      { numRuns: 100 },
    );
  });
});
