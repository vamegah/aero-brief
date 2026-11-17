/**
 * Typed source of truth for the color palette (Task 10.6; consumed by 10.9).
 *
 * KEEP IN SYNC with `tokens.css`: every entry in `palette` must appear in
 * tokens.css as `--<name>: <hex>;` with the same name and (lowercase) hex.
 * `test/palette-sync.test.ts` enforces this.
 *
 * Color is decoration only. Status is always also conveyed by text/label.
 *
 * Ratios below are hand-computed (WCAG relative luminance); 10.9 recomputes them.
 */

export const palette = {
  "color-bg": "#ffffff",
  "color-surface": "#f3f5f7",
  "color-text": "#1a1a1a",
  "color-text-muted": "#4a4a4a",
  "color-link": "#1d4ed8",
  "color-border": "#6b7280",
  "color-focus": "#1d4ed8",
  "color-ok-fg": "#14532d",
  "color-ok-bg": "#dcfce7",
  "color-warn-fg": "#713f12",
  "color-warn-bg": "#fef9c3",
  "color-danger-fg": "#7f1d1d",
  "color-danger-bg": "#fee2e2",
} as const;

export type PaletteToken = keyof typeof palette;

/** normal: 4.5:1 text. large: 3:1 text (>=18.66px bold or >=24px). ui: 3:1 non-text. */
export type TextSizeClass = "normal" | "large" | "ui";

export interface PalettePair {
  readonly fg: PaletteToken;
  readonly bg: PaletteToken;
  readonly size: TextSizeClass;
}

export const MIN_RATIO: Readonly<Record<TextSizeClass, number>> = {
  normal: 4.5,
  large: 3,
  ui: 3,
};

export const palettePairs: readonly PalettePair[] = [
  // Body text (~17:1 on bg, ~15.6:1 on surface)
  { fg: "color-text", bg: "color-bg", size: "normal" },
  { fg: "color-text", bg: "color-surface", size: "normal" },
  // Muted text (~8.9:1 on bg, ~8.1:1 on surface)
  { fg: "color-text-muted", bg: "color-bg", size: "normal" },
  { fg: "color-text-muted", bg: "color-surface", size: "normal" },
  // Links (~6.7:1 on bg, ~6.1:1 on surface)
  { fg: "color-link", bg: "color-bg", size: "normal" },
  { fg: "color-link", bg: "color-surface", size: "normal" },
  // Large headings in link color
  { fg: "color-link", bg: "color-bg", size: "large" },
  // Status badges/banners (~8.3, ~8.1, ~8.2:1)
  { fg: "color-ok-fg", bg: "color-ok-bg", size: "normal" },
  { fg: "color-warn-fg", bg: "color-warn-bg", size: "normal" },
  { fg: "color-danger-fg", bg: "color-danger-bg", size: "normal" },
  // Component boundaries (~4.8:1 on bg, ~4.4:1 on surface)
  { fg: "color-border", bg: "color-bg", size: "ui" },
  { fg: "color-border", bg: "color-surface", size: "ui" },
  // Focus indicator (~6.7:1 on bg, ~6.1:1 on surface)
  { fg: "color-focus", bg: "color-bg", size: "ui" },
  { fg: "color-focus", bg: "color-surface", size: "ui" },
];
