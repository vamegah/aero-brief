---
inclusion: always
---

# Visual Design

These rules apply to all frontend work in `apps/web`. The full design is in `.kiro/specs/aerobrief/design.md`, section "Design System and Page Layouts", and the requirement is Requirement 15.

## Design Principles

1. **Clarity over decoration.** A visual element earns its place only if it helps a reader find status faster.
2. **Text is the primary signal.** Every status, banner, and state can be read from its text alone.
3. **Color is decoration.** Color repeats what the text says and never carries meaning on its own.
4. **One primary action per view.** Each page shows at most one primary Button.
5. **Every state has a visible representation.** Loading, empty, error, and success each render visible text.

## Token Categories

Tokens live in `apps/web/src/styles/tokens.css`. Every color token is also an entry in `apps/web/src/styles/palette.ts`, and every color pair is in `palettePairs`.

- **Color (semantic):** surface, surface-raised, border, text-primary, text-muted, accent, warning, danger, success. Names use the `color-` prefix.
- **Spacing:** 4, 8, 12, 16, 24, 32, 48, 64 px.
- **Type scale:** 12, 14, 16, 20, 24, 32 px.
- **Radius:** 4, 8, 12 px.
- **Elevation:** 2 levels.
- **Motion:** 150ms ease-out for transitions, disabled under `prefers-reduced-motion: reduce`.

## Hard Rules

1. **Do not change the DOM structure of the airport table, the banners, the nav bar, or the `aria-live` region for styling.** Restyle with CSS and class names. Existing tests assert this structure.
2. **Every new color pair must pass WCAG 2.1 AA:** 4.5:1 for normal text, and 3:1 for large text, component boundaries, and focus indicators. Fix a failing pair by changing the token, never by lowering the threshold.
3. **No new runtime dependencies.** No Tailwind, no component libraries, and no icon packages. Icons are inline SVG only. Inside the status view, icons are CSS `mask-image` data URIs on an `aria-hidden` span, because the status view test rejects `<svg>` and `<img>` elements there.
