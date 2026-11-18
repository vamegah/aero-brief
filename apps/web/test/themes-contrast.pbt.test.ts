import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../src/styles/contrast";
import { MIN_RATIO, palettePairs, type TextSizeClass } from "../src/styles/palette";
import type { RegisteredThemeVariant } from "../src/styles/themes";
import { themePairs } from "../src/styles/themes.pairs";

// Feature: aerobrief-phase2, Property 4: Theme tokens meet their contrast thresholds
// Validates: Requirements 8.8, 9.9

interface VariantCase {
  readonly variant: RegisteredThemeVariant;
  readonly min: Readonly<Record<TextSizeClass, number>>;
}

// Task 3.3 adds "hc-light" and "hc-dark" here with MIN_RATIO_AAA.
const variants: readonly VariantCase[] = [{ variant: "dark", min: MIN_RATIO }];

const key = (p: { fg: string; bg: string; size: string }): string => `${p.fg}|${p.bg}|${p.size}`;

describe.each(variants)("Property 4: contrast thresholds ($variant)", ({ variant, min }) => {
  const pairs = themePairs(variant);

  it("has the same (fg, bg, size) set as palettePairs", () => {
    expect(pairs.map(key).sort()).toEqual(palettePairs.map(key).sort());
  });

  it("every randomly chosen pair meets the minimum ratio of its size class", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: pairs.length - 1 }), { minLength: 1, maxLength: pairs.length }),
        (indices) => {
          for (const i of indices) {
            const p = pairs[i]!;
            expect(contrastRatio(p.fgHex, p.bgHex), key(p)).toBeGreaterThanOrEqual(min[p.size]);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("every shuffled subset of pairs meets its threshold", () => {
    fc.assert(
      fc.property(fc.shuffledSubarray([...pairs], { minLength: 1 }), (subset) =>
        subset.every((p) => contrastRatio(p.fgHex, p.bgHex) >= min[p.size]),
      ),
      { numRuns: 100 },
    );
  });
});
