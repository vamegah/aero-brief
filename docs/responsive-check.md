# Responsive layout check (Task 16.13, Requirement 15.10)

Goal: every page is readable and every control is operable with no horizontal page scroll from 375 px to 1920 px. No automated screenshots are kept in the repo. This is a manual visual regression checklist.

## Breakpoints (design.md, "Responsive Breakpoints")

| Width | Layout | CSS |
|---|---|---|
| 375 px (base) | Single column. Nav links wrap under the brand. MetricChips stack. Watched list is a stacked list. Table cells wrap text. | Base rules in `app.css`, `primitives.css` |
| 768 px | MetricChips in one row. Watched list is a wrapping row of chips. | `@media (min-width: 768px)` in `primitives.css` |
| 1024 px | More page, header, footer and table cell padding. | `@media (min-width: 1024px)` in `primitives.css` |
| 1440 px | Maximum content width 1440 px, centered. | `main`, header and footer `max-width: 1440px`, plus `@media (min-width: 1440px)` |

## Changes made in this task (CSS only)

- Long strings (banners, event text, page titles, chips, footer, form errors, dialog) use `overflow-wrap: anywhere`. `main` uses `overflow-wrap: break-word`.
- Flex children that hold text (`page-header__text`, `event-card`, `summary-card`, `empty-state`, `loading-state`, `watched-list__name`) get `min-width: 0`, so they can shrink.
- Watched list: stacked at 375 px, wrapping chips from 768 px. Items wrap their Remove button instead of overflowing.
- `.form` max-width is `min(24rem, 100%)`.
- ConfirmDialog max-width is `min(28rem, 100vw - 2 * 16px)`. Its buttons wrap and grow.
- Added the 1024 px and 1440 px media queries.
- No DOM, aria, role or color changes, so no new `palettePairs` entries.
- Audit on resume: media queries are balanced and match the design table (768, 1024, 1440). No duplicated or unclosed rules. The only fixed width is the 20 px decorative banner icon. Watchlist rows with Add and Remove buttons sit in a table cell where the buttons wrap.
- Deploy config: `apps/web/vercel.json` now ends with a catch-all rewrite `/(.*)` to `/index.html`, so unknown paths render the client-side Not found page. It is last, so `/api/*` is matched first. Vercel serves real static files before rewrites.
- The airport tables need no scroll wrapper. Their cells already use `overflow-wrap: anywhere` and there is no `nowrap` or fixed width.

## Checklist (repeat for each page at 375, 768, 1024, 1440, and 1920 px)

Pages: Status `/`, Watchlist `/watchlist`, Sign in `/sign-in`, Auth callback `/auth/callback`, Unsubscribe `/unsubscribe`, Not found (any unknown path).

- [ ] No horizontal page scrollbar. Scroll right with the trackpad: nothing moves.
- [ ] Nav bar wraps under the brand at 375 px. All links are visible and `aria-current` is underlined.
- [ ] Tables (Status, Watchlist) are readable. Long airport names wrap. 30 rows are present. The sticky header stays at the top.
- [ ] Buttons and links are tappable, with a target of at least 24 px (buttons are 44 px).
- [ ] Focus outline is visible on every control when tabbing.
- [ ] Banners (stale data, nationwide, error) span the full content width. Their text wraps.
- [ ] Summary chips stack at 375 px and sit in one row from 768 px.
- [ ] Filter segment buttons wrap onto a second line if needed.
- [ ] Watchlist: counter chip, watched list, Add and Remove buttons all fit. "Delete account" opens a dialog that fits with a margin on both sides, and both buttons are reachable.
- [ ] Sign in: input and button fit. A long email in the "Check your inbox" message wraps.
- [ ] Auth callback, Unsubscribe, Not found: message and link are visible and wrap.
- [ ] At 1440 px and 1920 px, content stops at 1440 px and is centered.

## How to repeat with DevTools

1. `npm run dev -w @aerobrief/web` (or open the Vercel preview).
2. Open DevTools, toggle device mode (Ctrl+Shift+M), choose Responsive, and enter widths 375, 768, 1024, 1440, 1920.
3. Walk through the checklist above for each page. For the dialog, click "Delete account" on `/watchlist`.
4. Optional overflow check, run in the console: `document.documentElement.scrollWidth > document.documentElement.clientWidth`. It must be `false`. To find an offender: `[...document.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > innerWidth)`.

## Results of this check

| Method | Result |
|---|---|
| CSS inspection of all three stylesheets | No `nowrap`, fixed widths or `min-width` on tables, cells, chips or banners. Fixed the risks listed above. |
| Real browser (headless Edge, production build via `vite preview`) | Status page rendered in a true 375 px viewport (iframe): nav, heading, loading state and footer fit with no horizontal overflow. |
| Not verified in a browser | There was no API behind the preview. The Status table with 30 rows, the Watchlist table and watched list with data, banners with real data, and the ConfirmDialog were checked by CSS inspection only. Sign in, Auth callback, Unsubscribe and Not found were not viewed. Widths 768, 1024 and 1440 were not inspected visually. |
| Headless Edge `--window-size=375` | Unreliable. Edge enforces a minimum window width, so output looked clipped. Do not use it for 375 px. |

In the resume run no further browser screenshots were taken. Widths 768, 1024 and 1440 and every page other than Status were verified by CSS inspection only.

Someone should run the manual checklist once with data (the deployed preview) before release.
