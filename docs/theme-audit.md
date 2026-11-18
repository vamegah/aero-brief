# Theme audit: hard-coded colors (Task 2.1)

Branch: `phase-2`. Requirements 3.3 and 8.7.

Scope: every `*.css` under `apps/web/src` except `styles/tokens.css`, plus every `.tsx` under `apps/web/src`. Searched for hex, `rgb()`/`rgba()`, `hsl()`/`hsla()`, named colors and inline `style={...}`.

Files scanned: `src/index.css`, `src/styles/app.css`, `src/styles/primitives.css`. No other CSS files exist. `tokens.css` and `palette.ts` are frozen and were not edited.

## Literals that were replaced

| file:line (before) | literal | replacement | light value equal |
| --- | --- | --- | --- |
| `apps/web/src/index.css:124` (`.summary-card`) | `box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1)` | `box-shadow: var(--shadow-card)` | yes |
| `apps/web/src/index.css:181` (`.airport-table` wrapper) | `box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1)` | `box-shadow: var(--shadow-card)` | yes |

`--shadow-card: 0 1px 3px rgba(0, 0, 0, 0.1);` is defined in the new `apps/web/src/styles/tokens-phase2.css`. No existing token fits: `--elevation-1` and `--elevation-2` use `rgba(26, 26, 26, ...)` with different offsets, so using them would change the light appearance.

Why a token: a black shadow at 10% alpha is almost invisible on a dark surface. The token lets `themes.css` (Task 2.5) redefine it under `html[data-theme="dark"]`. Flag off, the computed value is identical to the old literal.

Shadows are not palette colors. `--shadow-card` is not in `palette.ts` and is not in `extraPalette`, so the contrast tests never read it. Because no color token was needed, `themes.ts` was not created. Task 2.5 creates it, and adds `extraPalette` only if it needs one.

`tokens-phase2.css` is imported in `apps/web/src/main.tsx` right after `tokens.css` and before `app.css`.

Note: `tokens.css` itself holds `rgba(26, 26, 26, ...)` in `--elevation-1` and `--elevation-2`. It is frozen. Task 2.5 can redefine both elevation tokens in `themes.css` for dark mode.

## Literals listed and left alone

These are not palette colors and do not change with the theme.

| file:line | literal | note |
| --- | --- | --- |
| `index.css:132`, `index.css:216` | `background: transparent` | no color |
| `app.css:42` | `background: transparent` | no color |
| `primitives.css:66` | `border: 2px solid transparent` | keeps layout; the high-contrast and forced-colors border stays invisible |
| `primitives.css:107` | `background: transparent` | no color |
| `primitives.css:13` | `background-color: currentColor` | follows the text color token |
| `primitives.css:176` | `border: 1px solid currentColor` | follows the text color token |
| `index.css:28,35,44,247`, `app.css:239,248` | `inherit` | keyword |
| `index.css:282` | `white-space: nowrap` | false positive, not a color |
| `index.css:282` | `clip: rect(0, 0, 0, 0)` | false positive, not a color |

## Mask-image data URIs

Locations: `primitives.css:24-55` (`.icon--plane`, `--check`, `--alert`, `--info`, `--error`, `--loading`, `--empty`) and `app.css:126,132,138` (`--banner-icon`).

Each SVG is a single `<path>` with no `fill`, `stroke` or color attribute and no `%23` hex. `mask-image` reads only the alpha channel of the image, so the SVG's own color is never drawn. The visible color comes from `background-color: currentColor`, which follows the theme's text tokens. No change needed, and the status-view test still sees no `<svg>` or `<img>` element.

## Inline styles in TSX

None. No `style={...}` and no color literals in any `.tsx` under `apps/web/src`.

## Result

2 literals replaced, 0 color tokens added, 1 shadow token added. Everything else is a keyword or already uses a token.


