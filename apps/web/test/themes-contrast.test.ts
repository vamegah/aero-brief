import { describe, expect, it } from "vitest";
import { contrastRatio } from "../src/styles/contrast";
import { MIN_RATIO, palettePairs } from "../src/styles/palette";
import { themePairs } from "../src/styles/themes.pairs";

describe("dark theme contrast thresholds (WCAG 2.1 AA)", () => {
  for (const p of themePairs("dark")) {
    const min = MIN_RATIO[p.size];
    it(`${p.fg} on ${p.bg} (${p.size}) >= ${min}`, () => {
      expect(contrastRatio(p.fgHex, p.bgHex)).toBeGreaterThanOrEqual(min);
    });
  }

  it("dark pairs have the same fg/bg/size triples as palettePairs", () => {
    const triples = (list: readonly { fg: string; bg: string; size: string }[]) =>
      list.map((p) => `${p.fg}|${p.bg}|${p.size}`);
    expect(triples(themePairs("dark"))).toEqual(triples(palettePairs));
  });
});
