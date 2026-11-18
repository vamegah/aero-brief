import { describe, expect, it } from "vitest";
import themesCss from "../src/styles/themes.css?raw";
import { palette } from "../src/styles/palette";
import { darkPalette, hcDarkPalette, hcLightPalette } from "../src/styles/themes";

/** Returns the declaration body of the first rule whose selector is exactly `selector`. */
export function extractBlock(css: string, selector: string): string {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const start = stripped.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`selector not found: ${selector}`);
  const open = stripped.indexOf("{", start);
  const close = stripped.indexOf("}", open);
  if (close === -1) throw new Error(`unterminated block: ${selector}`);
  return stripped.slice(open + 1, close);
}

const variants = [
  { theme: "dark", colors: darkPalette, colorSchemeDark: true },
  { theme: "hc-light", colors: hcLightPalette, colorSchemeDark: false },
  { theme: "hc-dark", colors: hcDarkPalette, colorSchemeDark: true },
] as const;

for (const { theme, colors, colorSchemeDark } of variants) {
  describe(`themes.ts and themes.css stay in sync (html[data-theme="${theme}"])`, () => {
    const block = extractBlock(themesCss, `html[data-theme="${theme}"]`);

    for (const [name, hex] of Object.entries(colors)) {
      it(`--${name} is ${hex} in the ${theme} block`, () => {
        expect(block).toContain(`--${name}: ${hex};`);
      });
    }

    it("defines every PaletteToken", () => {
      for (const name of Object.keys(palette)) {
        expect(block, `missing --${name}`).toContain(`--${name}:`);
        expect(colors).toHaveProperty(name);
      }
    });

    if (colorSchemeDark) {
      it("sets color-scheme: dark", () => {
        expect(block).toContain("color-scheme: dark;");
      });
    } else {
      it("does not set color-scheme: dark (light variant)", () => {
        expect(block).not.toContain("color-scheme: dark");
      });
    }
  });
}

describe("themes.css global rules", () => {
  it("has no prefers-color-scheme text anywhere in themes.css", () => {
    expect(themesCss).not.toContain("prefers-color-scheme");
  });

  it("has no prefers-contrast text anywhere in themes.css", () => {
    expect(themesCss).not.toContain("prefers-contrast");
  });

  it("every selector that mentions hc- starts with html[data-theme", () => {
    const stripped = themesCss.replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = [...stripped.matchAll(/([^{}]+)\{/g)]
      .flatMap((m) => (m[1] ?? "").split(","))
      .map((sel) => sel.trim())
      .filter((sel) => sel.includes("hc-"));
    expect(selectors.length).toBeGreaterThan(0);
    for (const sel of selectors) {
      expect(sel, `unscoped hc rule: ${sel}`).toMatch(/^html\[data-theme(\^)?="hc-(light|dark)?"\]/);
    }
  });
});
