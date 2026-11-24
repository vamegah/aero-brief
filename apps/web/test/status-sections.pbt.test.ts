import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { STATUS_SECTION_IDS, resolveStatusSection } from "../src/lib/status-sections";

const NUM_RUNS = 200;

const ids: readonly string[] = STATUS_SECTION_IDS;

/** Random text, with and without "#", plus near-miss section names. */
const hashArb: fc.Arbitrary<string> = fc.oneof(
  fc.string(),
  fc.string().map((s) => `#${s}`),
  fc.constantFrom(...STATUS_SECTION_IDS).map((id) => `#${id}`),
  fc.constantFrom(...STATUS_SECTION_IDS),
  fc.constantFrom(...STATUS_SECTION_IDS).map((id) => `#${id}x`),
  fc.constantFrom(...STATUS_SECTION_IDS).map((id) => `##${id}`),
  fc.constantFrom(...STATUS_SECTION_IDS).map((id) => `#${id.toUpperCase()}`),
);

describe("resolveStatusSection properties", () => {
  // Feature: ui-refresh, Property 8: A hash always resolves to a dashboard section
  // **Validates: Requirements 18.1, 18.2**
  it("Property 8: always returns a section id, and overview for any non-section string", () => {
    fc.assert(
      fc.property(hashArb, (hash) => {
        const result = resolveStatusSection(hash);
        expect(ids).toContain(result);
        const bare = hash.startsWith("#") ? hash.slice(1) : hash;
        if (!ids.includes(bare)) expect(result).toBe("overview");
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ui-refresh, Property 8: A hash always resolves to a dashboard section
  // **Validates: Requirements 18.1, 18.2**
  it("Property 8: '#' + id resolves to that id", () => {
    fc.assert(
      fc.property(fc.constantFrom(...STATUS_SECTION_IDS), (id) => {
        expect(resolveStatusSection(`#${id}`)).toBe(id);
      }),
      { numRuns: 100 },
    );
  });
});
