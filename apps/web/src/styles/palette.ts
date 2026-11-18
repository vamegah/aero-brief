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
  "color-border": "#646b78",
  "color-focus": "#1d4ed8",
  "color-ok-fg": "#14532d",
  "color-ok-bg": "#dcfce7",
  "color-warn-fg": "#713f12",
  "color-warn-bg": "#fef9c3",
  "color-danger-fg": "#7f1d1d",
  "color-danger-bg": "#fee2e2",
  // Semantic roles (Task 16.1)
  "color-surface-raised": "#ffffff",
  "color-text-primary": "#1a1a1a",
  "color-accent": "#1d4ed8",
  "color-accent-surface": "#dbeafe",
  "color-on-accent": "#ffffff",
  "color-warning": "#92400e",
  "color-warning-surface": "#fef9c3",
  "color-danger": "#b91c1c",
  "color-danger-surface": "#fee2e2",
  "color-on-danger": "#ffffff",
  "color-success": "#166534",
  "color-success-surface": "#dcfce7",
  // Disabled controls (Task 16.19)
  "color-disabled-fg": "#4b5563",
  "color-disabled-bg": "#e5e7eb",
  "color-disabled-border": "#7c8494",
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
  // Component boundaries (~5.4:1 on bg and surface-raised, ~4.9:1 on surface)
  { fg: "color-border", bg: "color-bg", size: "ui" },
  { fg: "color-border", bg: "color-surface", size: "ui" },
  // Focus indicator (~6.7:1 on bg, ~6.1:1 on surface)
  { fg: "color-focus", bg: "color-bg", size: "ui" },
  { fg: "color-focus", bg: "color-surface", size: "ui" },

  // Task 16.1: semantic roles
  { fg: "color-text-primary", bg: "color-bg", size: "normal" },
  { fg: "color-text-primary", bg: "color-surface", size: "normal" },
  { fg: "color-text-primary", bg: "color-surface-raised", size: "normal" },
  { fg: "color-text-muted", bg: "color-surface-raised", size: "normal" },
  { fg: "color-border", bg: "color-surface-raised", size: "ui" },
  { fg: "color-focus", bg: "color-surface-raised", size: "ui" },
  // Accent text, links and primary button
  { fg: "color-accent", bg: "color-bg", size: "normal" },
  { fg: "color-accent", bg: "color-surface", size: "normal" },
  { fg: "color-accent", bg: "color-surface-raised", size: "normal" },
  { fg: "color-accent", bg: "color-accent-surface", size: "normal" },
  { fg: "color-on-accent", bg: "color-accent", size: "normal" },
  // Warning, danger, success: text on page surfaces
  { fg: "color-warning", bg: "color-bg", size: "normal" },
  { fg: "color-warning", bg: "color-surface", size: "normal" },
  { fg: "color-danger", bg: "color-bg", size: "normal" },
  { fg: "color-danger", bg: "color-surface", size: "normal" },
  { fg: "color-success", bg: "color-bg", size: "normal" },
  { fg: "color-success", bg: "color-surface", size: "normal" },
  // Pills and banners on tinted surfaces
  { fg: "color-warning", bg: "color-warning-surface", size: "normal" },
  { fg: "color-danger", bg: "color-danger-surface", size: "normal" },
  { fg: "color-success", bg: "color-success-surface", size: "normal" },
  { fg: "color-text-primary", bg: "color-warning-surface", size: "normal" },
  { fg: "color-text-primary", bg: "color-danger-surface", size: "normal" },
  { fg: "color-text-primary", bg: "color-success-surface", size: "normal" },
  { fg: "color-text-primary", bg: "color-accent-surface", size: "normal" },
  // Danger button
  { fg: "color-on-danger", bg: "color-danger", size: "normal" },
  // Status-colored borders and icons as UI components
  { fg: "color-warning", bg: "color-warning-surface", size: "ui" },
  { fg: "color-danger", bg: "color-danger-surface", size: "ui" },
  { fg: "color-success", bg: "color-success-surface", size: "ui" },
  { fg: "color-accent", bg: "color-accent-surface", size: "ui" },

  // Task 16.14 coverage audit: combinations rendered in the UI that were not yet listed.
  // Form error text inside a raised surface (form-error in a dialog or card)
  { fg: "color-danger", bg: "color-surface-raised", size: "normal" },
  // Links inside event cards and the confirm dialog (raised surface)
  { fg: "color-link", bg: "color-surface-raised", size: "normal" },
  // Focus outline on tinted surfaces (banners, pills, pressed segment option)
  { fg: "color-focus", bg: "color-accent-surface", size: "ui" },
  { fg: "color-focus", bg: "color-warning-surface", size: "ui" },
  { fg: "color-focus", bg: "color-danger-surface", size: "ui" },
  { fg: "color-focus", bg: "color-success-surface", size: "ui" },

  // Task 16.19: disabled controls (exempt from WCAG, but kept readable)
  { fg: "color-disabled-fg", bg: "color-disabled-bg", size: "normal" },
  { fg: "color-disabled-border", bg: "color-bg", size: "ui" },
  { fg: "color-disabled-border", bg: "color-surface", size: "ui" },
  { fg: "color-disabled-border", bg: "color-surface-raised", size: "ui" },
];
