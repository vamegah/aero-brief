import { describe, expect, it } from "vitest";
import { contrastRatio, parseHex, relativeLuminance } from "../src/styles/contrast";
import { MIN_RATIO, palette, palettePairs } from "../src/styles/palette";

describe("contrast math", () => {
  it("black on white is 21", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });

  it("white on black is 21 (symmetric)", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });

  it("same colour is 1", () => {
    expect(contrastRatio("#1d4ed8", "#1d4ed8")).toBe(1);
  });

  it("luminance of black and white", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 10);
  });

  it("#767676 on white is about 4.54 (known value)", () => {
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });

  it("parses hex and rejects bad input", () => {
    expect(parseHex("#0a0B0c")).toEqual([10, 11, 12]);
    expect(() => parseHex("fff")).toThrow();
  });
});

describe("palette contrast thresholds (WCAG 2.1)", () => {
  for (const p of palettePairs) {
    const min = MIN_RATIO[p.size];
    it(`${p.fg} on ${p.bg} (${p.size}) >= ${min}`, () => {
      expect(contrastRatio(palette[p.fg], palette[p.bg])).toBeGreaterThanOrEqual(min);
    });
  }
});
