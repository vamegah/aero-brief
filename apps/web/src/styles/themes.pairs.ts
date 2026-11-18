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

/** Every `palettePairs` entry resolved to the variant's colors. */
export function themePairs(variant: RegisteredThemeVariant): readonly ThemePair[] {
  const colors = themePalettes[variant];
  return palettePairs.map((p) => ({
    fg: p.fg,
    bg: p.bg,
    size: p.size,
    fgHex: colors[p.fg],
    bgHex: colors[p.bg],
  }));
}
