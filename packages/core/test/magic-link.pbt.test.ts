import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { classifyMagicLink, MAGIC_LINK_TTL_MS, type LinkState } from "../src/account";

const MIN_MS = Date.UTC(2020, 0, 1);
const MAX_MS = Date.UTC(2040, 0, 1);

const dateArb = fc.integer({ min: MIN_MS, max: MAX_MS }).map((ms) => new Date(ms));
// A flag is either unset or set to some date.
const flagArb = fc.option(dateArb, { nil: null });

type Case = { link: LinkState; now: Date };

// Offsets are biased toward the 15-minute boundary, plus future-dated links.
const offsetArb = fc.oneof(
  fc.integer({ min: -MAGIC_LINK_TTL_MS, max: 2 * MAGIC_LINK_TTL_MS }),
  fc.integer({ min: MAGIC_LINK_TTL_MS - 2, max: MAGIC_LINK_TTL_MS + 2 }),
  fc.constantFrom(-1, 0, 1, MAGIC_LINK_TTL_MS - 1, MAGIC_LINK_TTL_MS, MAGIC_LINK_TTL_MS + 1),
);

const caseArb: fc.Arbitrary<Case> = fc
  .record({
    createdAt: dateArb,
    offset: offsetArb,
    usedAt: flagArb,
    invalidatedAt: flagArb,
  })
  .map(({ createdAt, offset, usedAt, invalidatedAt }) => ({
    link: { createdAt, usedAt, invalidatedAt },
    now: new Date(createdAt.getTime() + offset),
  }));

describe("Feature: aerobrief, Property 18: Magic link validity", () => {
  /** **Validates: Requirements 7.2, 7.4** */
  test("valid iff unused, not invalidated, and now < createdAt + 15 minutes", () => {
    fc.assert(
      fc.property(caseArb, ({ link, now }) => {
        const expectedValid =
          link.usedAt === null &&
          link.invalidatedAt === null &&
          now.getTime() < link.createdAt.getTime() + MAGIC_LINK_TTL_MS;
        expect(classifyMagicLink(link, now) === "valid").toBe(expectedValid);
      }),
      { numRuns: 200 },
    );
  });

  /** **Validates: Requirements 7.2, 7.4** */
  test("an unknown token is never valid", () => {
    fc.assert(
      fc.property(dateArb, (now) => {
        expect(classifyMagicLink(null, now)).not.toBe("valid");
      }),
      { numRuns: 100 },
    );
  });

  /** **Validates: Requirements 7.2, 7.4** */
  test("unused, non-invalidated links expire at exactly 15 minutes", () => {
    fc.assert(
      fc.property(dateArb, (createdAt) => {
        const link: LinkState = { createdAt, usedAt: null, invalidatedAt: null };
        const at = (ms: number): Date => new Date(createdAt.getTime() + ms);
        expect(classifyMagicLink(link, at(MAGIC_LINK_TTL_MS - 1))).toBe("valid");
        expect(classifyMagicLink(link, at(MAGIC_LINK_TTL_MS))).toBe("expired");
      }),
      { numRuns: 100 },
    );
  });
});
