import { describe, expect, it } from "vitest";
import tokensCss from "../src/styles/tokens.css?raw";
import { palette, palettePairs } from "../src/styles/palette";

describe("palette.ts and tokens.css stay in sync", () => {
  for (const [name, hex] of Object.entries(palette)) {
    it(`--${name} is ${hex} in tokens.css`, () => {
      expect(tokensCss).toContain(`--${name}: ${hex};`);
    });
  }

  it("every pair references a defined token", () => {
    for (const p of palettePairs) {
      expect(palette).toHaveProperty(p.fg);
      expect(palette).toHaveProperty(p.bg);
    }
  });

  it("defines a visible focus outline", () => {
    expect(tokensCss).toContain("--focus-outline:");
    expect(tokensCss).toContain(":focus-visible");
  });
});
