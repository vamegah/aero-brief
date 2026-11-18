/**
 * Typed dark token set (Task 2.5). Mirrors `palette.ts`.
 *
 * KEEP IN SYNC with `themes.css`: every entry in `darkPalette` must appear in the
 * `html[data-theme="dark"]` block as `--<name>: <hex>;` with the same lowercase hex.
 * Typed `Record<PaletteToken, string>`, so a missing token is a compile error.
 *
 * Color is decoration only. Status is always also conveyed by text/label.
 * Fix a failing contrast pair by changing a token here and in themes.css,
 * never by lowering a threshold. High-contrast palettes arrive in Task 3.1.
 */
import { palette, type PaletteToken } from "./palette";

export type ThemePalette = Record<PaletteToken, string>;

export const darkPalette: ThemePalette = {
  "color-bg": "#0b1220",
  "color-page": "#0f172a",
  "color-surface": "#131c2e",
  "color-text": "#e2e8f0",
  "color-text-muted": "#a3b1c6",
  "color-link": "#8bb4ff",
  "color-border": "#7b879a",
  "color-focus": "#9dbcff",
  "color-ok-fg": "#86efac",
  "color-ok-bg": "#0f2e1c",
  "color-warn-fg": "#fcd34d",
  "color-warn-bg": "#33270a",
  "color-danger-fg": "#fca5a5",
  "color-danger-bg": "#3b1219",
  // Semantic roles
  "color-surface-raised": "#172033",
  "color-text-primary": "#e2e8f0",
  "color-accent": "#8bb4ff",
  "color-accent-surface": "#172554",
  "color-on-accent": "#0b1220",
  "color-warning": "#fbbf24",
  "color-warning-surface": "#33270a",
  "color-danger": "#f87171",
  "color-danger-surface": "#3b1219",
  "color-on-danger": "#0b1220",
  "color-success": "#4ade80",
  "color-success-surface": "#0f2e1c",
  // Disabled controls
  "color-disabled-fg": "#94a3b8",
  "color-disabled-bg": "#1e293b",
  "color-disabled-border": "#6b778a",
  // Summary hero card
  "color-status-normal": "#4ade80",
  "color-status-warning": "#fbbf24",
  "color-status-alert": "#f87171",
  "color-chip-bg": "#1e293b",
  "color-chip-text": "#cbd5e1",
  // Airport table
  "color-table-head-bg": "#111a2c",
  "color-table-muted": "#94a3b8",
  "color-table-rule": "#1e293b",
  "color-pill-danger-text": "#fca5a5",
  // Event alert cards: decorative left-border accents only, not in palettePairs.
  "color-event-accent": "#60a5fa",
  "color-event-accent-started": "#f87171",
  "color-event-accent-ended": "#4ade80",
};

/** Variants with a registered palette so far. `hc-light` and `hc-dark` are added in Task 3.1. */
export type RegisteredThemeVariant = "light" | "dark";

export const themePalettes: Readonly<Record<RegisteredThemeVariant, ThemePalette>> = {
  light: palette,
  dark: darkPalette,
};
