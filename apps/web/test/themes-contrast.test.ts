import { describe, expect, it } from "vitest";
import { contrastRatio } from "../src/styles/contrast";
import { MIN_RATIO, palettePairs } from "../src/styles/palette";
import { hcFocusPairs, MIN_RATIO_AAA, themePairs } from "../src/styles/themes.pairs";

type Triple = { fg: string; bg: string; size: string };
const triples = (list: readonly Triple[]) => list.map((p) => `${p.fg}|${p.bg}|${p.size}`);

describe("dark theme contrast thresholds (WCAG 2.1 AA)", () => {
  for (const p of themePairs("dark")) {
    const min = MIN_RATIO[p.size];
    it(`${p.fg} on ${p.bg} (${p.size}) >= ${min}`, () => {
      expect(contrastRatio(p.fgHex, p.bgHex)).toBeGreaterThanOrEqual(min);
    });
  }

  it("dark pairs have the same fg/bg/size triples as palettePairs", () => {
    expect(triples(themePairs("dark"))).toEqual(triples(palettePairs));
  });
});

for (const variant of ["hc-light", "hc-dark"] as const) {
  describe(`${variant} theme contrast thresholds (WCAG 2.1 AAA)`, () => {
    for (const p of themePairs(variant)) {
      const min = MIN_RATIO_AAA[p.size];
      it(`${p.fg} on ${p.bg} (${p.size}) >= ${min}`, () => {
        expect(contrastRatio(p.fgHex, p.bgHex)).toBeGreaterThanOrEqual(min);
      });
    }

    it("pairs are the palettePairs triples plus hcFocusPairs", () => {
      expect(triples(themePairs(variant))).toEqual(triples([...palettePairs, ...hcFocusPairs]));
    });

    it("includes every hcFocusPairs entry at the 4.5:1 UI threshold", () => {
      expect(hcFocusPairs.length).toBeGreaterThan(0);
      const actual = new Set(triples(themePairs(variant)));
      for (const f of hcFocusPairs) {
        expect(actual.has(`${f.fg}|${f.bg}|${f.size}`)).toBe(true);
        expect(MIN_RATIO_AAA[f.size]).toBe(4.5);
      }
    });
  });
}
