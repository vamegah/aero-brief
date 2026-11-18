import { describe, expect, it } from "vitest";
import themesCss from "../src/styles/themes.css?raw";
import { palette } from "../src/styles/palette";
import { darkPalette } from "../src/styles/themes";


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

describe('themes.ts and themes.css stay in sync (html[data-theme="dark"])', () => {
  const block = extractBlock(themesCss, 'html[data-theme="dark"]');

  for (const [name, hex] of Object.entries(darkPalette)) {
    it(`--${name} is ${hex} in the dark block`, () => {
      expect(block).toContain(`--${name}: ${hex};`);
    });
  }

  it("defines every PaletteToken", () => {
    for (const name of Object.keys(palette)) {
      expect(block, `missing --${name}`).toContain(`--${name}:`);
      expect(darkPalette).toHaveProperty(name);
    }
  });

  it("sets color-scheme: dark", () => {
    expect(block).toContain("color-scheme: dark;");
  });

  it("has no prefers-color-scheme text anywhere in themes.css", () => {
    expect(themesCss).not.toContain("prefers-color-scheme");
  });
});
