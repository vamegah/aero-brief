import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Features } from "../src/features/features-schema";
import { SECTION_IDS, resolveSection, visibleSections } from "../src/lib/settings-sections";

const NUM_RUNS = 200;

const featuresArb: fc.Arbitrary<Features> = fc.record({
  darkMode: fc.boolean(),
  highContrast: fc.boolean(),
  digests: fc.boolean(),
  webhooks: fc.boolean(),
});

/** Arbitrary hashes: random text, with and without "#", plus near-miss section names. */
const hashArb: fc.Arbitrary<string> = fc.oneof(
  fc.string(),
  fc.string().map((s) => `#${s}`),
  fc.constantFrom(...SECTION_IDS).map((id) => `#${id}`),
  fc.constantFrom(...SECTION_IDS),
  fc.constantFrom(...SECTION_IDS).map((id) => `#${id}x`),
  fc.constantFrom(...SECTION_IDS).map((id) => `##${id}`),
  fc.constantFrom(...SECTION_IDS).map((id) => `#${id.toUpperCase()}`),
);

describe("Property 1: Visible sections follow the flags", () => {
  // Feature: ui-refresh, Property 1: Visible sections follow the flags
  // **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6, 1.7**
  it("returns an ordered subsequence with membership decided by the flags", () => {
    fc.assert(
      fc.property(featuresArb, (flags) => {
        const visible = visibleSections(flags);
        const indexes = visible.map((id) => SECTION_IDS.indexOf(id));
        expect(indexes.every((i) => i >= 0)).toBe(true);
        expect([...indexes].sort((a, b) => a - b)).toEqual(indexes);
        expect(new Set(visible).size).toBe(visible.length);
        expect(visible).toContain("account");
        expect(visible.includes("display")).toBe(flags.darkMode || flags.highContrast);
        expect(visible.includes("digest")).toBe(flags.digests);
        expect(visible.includes("webhooks")).toBe(flags.webhooks);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("Property 2: Hash resolution always lands on a visible section", () => {
  // Feature: ui-refresh, Property 2: Hash resolution always lands on a visible section
  // **Validates: Requirements 2.1, 2.2**
  it("returns a visible id, and the first visible id when the hash names no visible section", () => {
    fc.assert(
      fc.property(featuresArb, hashArb, (flags, hash) => {
        const visible = visibleSections(flags);
        const resolved = resolveSection(hash, visible);
        expect(visible).toContain(resolved);
        const wanted = hash.startsWith("#") ? hash.slice(1) : hash;
        if (!visible.some((id) => id === wanted)) {
          expect(resolved).toBe(visible[0]);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("Property 3: Deep link round trip", () => {
  // Feature: ui-refresh, Property 3: Deep link round trip
  // **Validates: Requirements 2.1**
  it("resolves '#' + id back to id for every visible section", () => {
    fc.assert(
      fc.property(featuresArb, fc.nat(), (flags, n) => {
        const visible = visibleSections(flags);
        const id = visible[n % visible.length]!;
        expect(resolveSection(`#${id}`, visible)).toBe(id);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
