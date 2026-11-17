import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { normalizeResponse } from "../src/normalize";
import { SnapshotSchema } from "../src/schemas";
import { faaResponseArb, isoTimestampArb, snapshotArb } from "./arbitraries";

// Feature: aerobrief, Property 3: Snapshot JSON round trip
// **Validates: Requirements 2.8**
describe("Property 3: Snapshot JSON round trip", () => {
  it("parsing the JSON of a normalized Snapshot yields a deeply equal Snapshot", () => {
    fc.assert(
      fc.property(
        faaResponseArb,
        isoTimestampArb,
        fc.uuid(),
        fc.option(snapshotArb, { nil: null }),
        (faa, capturedAt, id, previous) => {
          const snapshot = normalizeResponse(faa, capturedAt, id, previous);
          const parsed = SnapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)));
          expect(parsed).toEqual(snapshot);
        },
      ),
      { numRuns: 200 },
    );
  });
});
