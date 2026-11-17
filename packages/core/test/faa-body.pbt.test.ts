import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parseFaaBody } from "../src/schemas";
import { faaResponseArb } from "./arbitraries";

// Feature: aerobrief, Property 1: FAA body classification
// **Validates: Requirements 1.6, 2.3**

const RUNS = { numRuns: 100 };

/** Independent oracle: is the text valid JSON? */
function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** Arbitrary text, biased toward near-JSON garbage and truncated documents. */
const bodyArb: fc.Arbitrary<string> = fc.oneof(
  fc.string({ maxLength: 60 }),
  fc.constantFrom("", " ", "\n", "<html>", "[", "{", "[{", "nul", "[1,]", "{'a':1}"),
  fc.jsonValue().map((v) => JSON.stringify(v)),
  fc.jsonValue().map((v) => JSON.stringify(v).slice(0, -1)),
  faaResponseArb.map((r) => JSON.stringify(r)),
);

/** Valid JSON that is not an array, so it cannot match the FAA schema. */
const nonArrayJsonArb: fc.Arbitrary<string> = fc
  .jsonValue()
  .filter((v) => !Array.isArray(v))
  .map((v) => JSON.stringify(v));

/** Valid JSON array whose entries are not objects, so the schema rejects it. */
const badEntriesJsonArb: fc.Arbitrary<string> = fc
  .array(fc.oneof(fc.integer(), fc.string(), fc.boolean(), fc.constant(null)), { minLength: 1, maxLength: 5 })
  .map((v) => JSON.stringify(v));

describe("Property 1: FAA body classification", () => {
  it("never throws and classifies every string consistently with JSON validity", () => {
    fc.assert(
      fc.property(bodyArb, (text) => {
        const result = parseFaaBody(text);
        if (!isJson(text)) {
          expect(result.kind).toBe("unparseable");
        } else {
          expect(["ok", "validation"]).toContain(result.kind);
        }
      }),
      RUNS,
    );
  });

  it("classifies non-JSON text, including the empty string, as unparseable", () => {
    expect(parseFaaBody("").kind).toBe("unparseable");
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }).filter((s) => !isJson(s)), (text) => {
        expect(parseFaaBody(text).kind).toBe("unparseable");
      }),
      RUNS,
    );
  });

  it("classifies valid JSON that does not match the FAA schema as validation", () => {
    fc.assert(
      fc.property(fc.oneof(nonArrayJsonArb, badEntriesJsonArb), (text) => {
        const result = parseFaaBody(text);
        expect(result.kind).toBe("validation");
        if (result.kind === "validation") expect(result.issues.length).toBeGreaterThan(0);
      }),
      RUNS,
    );
  });

  it("accepts serialized schema-valid FAA responses as ok", () => {
    fc.assert(
      fc.property(faaResponseArb, (response) => {
        const result = parseFaaBody(JSON.stringify(response));
        expect(result.kind).toBe("ok");
        if (result.kind === "ok") expect(result.response).toHaveLength(response.length);
      }),
      RUNS,
    );
  });
});
