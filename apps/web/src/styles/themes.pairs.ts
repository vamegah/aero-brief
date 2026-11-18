/**
 * Theme contrast pairs (Task 2.5). Derived from `palettePairs`, so the set of
 * (fg, bg, size) triples in every variant equals the light set.
 * AA thresholds come from `MIN_RATIO` in palette.ts; AAA thresholds are below.
 * Never lower a threshold to make a pair pass: change the token.
 */
import { palettePairs, type PalettePair, type TextSizeClass } from "./palette";
import { themePalettes, type RegisteredThemeVariant } from "./themes";

/** WCAG 2.1 Level AAA: 7:1 normal text, 4.5:1 large text and UI components. */
export const MIN_RATIO_AAA: Readonly<Record<TextSizeClass, number>> = {
  normal: 7,
  large: 4.5,
  ui: 4.5,
};

export interface ThemePair extends PalettePair {
  readonly fgHex: string;
  readonly bgHex: string;
}

const HIGH_CONTRAST: ReadonlySet<RegisteredThemeVariant> = new Set<RegisteredThemeVariant>([
  "hc-light",
  "hc-dark",
]);

/**
 * Focus pairs added to the high-contrast variants: `color-focus` (ui, 4.5:1) against every
 * token that appears as `bg` in `palettePairs`, skipping pairs `palettePairs` already lists.
 */
export const hcFocusPairs: readonly PalettePair[] = (() => {
  const listed = new Set(palettePairs.filter((p) => p.fg === "color-focus").map((p) => `${p.bg}|${p.size}`));
  const bgs = [...new Set(palettePairs.map((p) => p.bg))];
  return bgs
    .filter((bg) => bg !== "color-focus" && !listed.has(`${bg}|ui`))
    .map((bg): PalettePair => ({ fg: "color-focus", bg, size: "ui" }));
})();

/**
 * Every `palettePairs` entry resolved to the variant's colors. High-contrast variants also
 * include `hcFocusPairs`.
 */
export function themePairs(variant: RegisteredThemeVariant): readonly ThemePair[] {
  const colors = themePalettes[variant];
  const base = HIGH_CONTRAST.has(variant) ? [...palettePairs, ...hcFocusPairs] : palettePairs;
  return base.map((p) => ({
    fg: p.fg,
    bg: p.bg,
    size: p.size,
    fgHex: colors[p.fg],
    bgHex: colors[p.bg],
  }));
}
