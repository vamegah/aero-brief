import fc from "fast-check";
import { describe, expect, it } from "vitest";
import controlsCss from "../src/styles/controls.css?raw";
import settingsCss from "../src/styles/settings.css?raw";
import shellCss from "../src/styles/shell.css?raw";
import surfacesCss from "../src/styles/surfaces.css?raw";
import tablesCss from "../src/styles/tables.css?raw";
import { contrastRatio } from "../src/styles/contrast";
import { MIN_RATIO, palettePairs, type PalettePair, type PaletteToken } from "../src/styles/palette";
import type { RegisteredThemeVariant } from "../src/styles/themes";
import { MIN_RATIO_AAA, themePairs } from "../src/styles/themes.pairs";

// Feature: ui-refresh, Property 4: Every palette pair meets its threshold in every theme
// **Validates: Requirements 13.1, 13.2, 13.3, 13.4**

const NUM_RUNS = 200;

const VARIANTS: readonly RegisteredThemeVariant[] = ["light", "dark", "hc-light", "hc-dark"];

const thresholds = (variant: RegisteredThemeVariant) =>
  variant === "hc-light" || variant === "hc-dark" ? MIN_RATIO_AAA : MIN_RATIO;

const key = (p: { fg: string; bg: string; size: string }): string => `${p.fg}|${p.bg}|${p.size}`;

const p = (fg: PaletteToken, bg: PaletteToken, size: PalettePair["size"]): PalettePair => ({ fg, bg, size });

/**
 * Audit result for shell.css, tables.css, controls.css, settings.css and surfaces.css:
 * every foreground/background (and border or focus outline on background) combination they use.
 * Each must be in palettePairs. `color-table-rule` is intentionally absent: it only draws
 * decorative Card, table, header and tab-bar separators.
 */
const NEW_STYLESHEET_PAIRS: readonly PalettePair[] = [
  // shell.css
  p("color-text-primary", "color-surface-raised", "normal"),
  p("color-text-primary", "color-page", "normal"),
  p("color-link", "color-surface-raised", "normal"),
  p("color-accent", "color-accent-surface", "normal"),
  p("color-accent", "color-accent-surface", "ui"),
  p("color-focus", "color-page", "ui"),
  p("color-focus", "color-surface-raised", "ui"),
  // tables.css
  p("color-text-muted", "color-page", "normal"),
  p("color-table-muted", "color-table-head-bg", "normal"),
  p("color-table-muted", "color-surface-raised", "normal"),
  p("color-link", "color-surface-raised", "normal"),
  // controls.css
  p("color-on-accent", "color-accent", "normal"),
  p("color-text-primary", "color-surface-raised", "normal"),
  p("color-text-primary", "color-surface", "normal"),
  p("color-border", "color-surface-raised", "ui"),
  p("color-border", "color-surface", "ui"),
  p("color-border", "color-page", "ui"),
  p("color-on-danger", "color-danger", "normal"),
  p("color-danger", "color-page", "ui"),
  p("color-danger", "color-surface-raised", "ui"),
  p("color-accent", "color-page", "normal"),
  p("color-accent", "color-surface", "normal"),
  p("color-disabled-fg", "color-disabled-bg", "normal"),
  p("color-disabled-fg", "color-surface-raised", "normal"),
  p("color-success", "color-success-surface", "normal"),
  p("color-pill-danger-text", "color-danger-surface", "normal"),
  p("color-chip-text", "color-chip-bg", "normal"),
  // settings.css
  p("color-text-primary", "color-accent-surface", "normal"),
  p("color-focus", "color-accent-surface", "ui"),
  // surfaces.css
  p("color-text-muted", "color-surface-raised", "normal"),
  p("color-status-normal", "color-surface-raised", "large"),
  p("color-status-warning", "color-surface-raised", "large"),
  p("color-status-alert", "color-surface-raised", "large"),
];

describe("Property 4: every palette pair meets its threshold in every theme", () => {
  describe.each(VARIANTS)("%s", (variant) => {
    const pairs = themePairs(variant);
    const min = thresholds(variant);

    it("any sampled pair meets the minimum ratio of its size class", () => {
      expect(pairs.length).toBeGreaterThan(0);
      fc.assert(
        fc.property(fc.constantFrom(...pairs), (pair) => {
          expect(contrastRatio(pair.fgHex, pair.bgHex), key(pair)).toBeGreaterThanOrEqual(min[pair.size]);
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it("the pair list contains every combination the new stylesheets use", () => {
      const listed = new Set(pairs.map(key));
      fc.assert(
        fc.property(fc.constantFrom(...NEW_STYLESHEET_PAIRS), (pair) => {
          expect(listed.has(key(pair)), key(pair)).toBe(true);
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  it("palettePairs lists every audited combination", () => {
    const listed = new Set(palettePairs.map(key));
    for (const pair of NEW_STYLESHEET_PAIRS) expect(listed.has(key(pair)), key(pair)).toBe(true);
  });

  it("color-table-rule is used only in border declarations, so it needs no pair", () => {
    const files = { "shell.css": shellCss, "tables.css": tablesCss, "controls.css": controlsCss, "settings.css": settingsCss, "surfaces.css": surfacesCss };
    for (const [file, css] of Object.entries(files)) {
      const lines = css.split(/\r?\n/);
      for (const line of lines) {
        if (!line.includes("var(--color-table-rule)")) continue;
        expect(line, `${file}: ${line.trim()}`).toMatch(/^\s*border(-[a-z]+)*\s*:/);
      }
    }
  });
});
