# Design Document: UI Refresh

## Overview

The refresh has three parts: a Settings page with a menu, an app shell and restyle, and a responsive fix for tables and controls. All work is in `apps/web`. Language: TypeScript (strict), React 18, Vite, Vitest, fast-check. No dependency is added.

The design follows the steering rules in `.kiro/steering/design.md`: restyle with CSS and class names, keep the pinned DOM (airport tables, banners, nav bar, `aria-live` region), pass WCAG 2.1 AA in every theme by changing tokens, one primary Button per view, text carries every status.

### What the code review found

| Finding | Where | Effect on the design |
|---|---|---|
| `overflow-wrap: anywhere` on `.airport-table th, td` | `primitives.css`, `index.css` | Lets the browser shrink a table column to one character. Causes "STATU S", the one-letter-per-line "Add" button and the vertical "Not watching" pill. Fix: remove it, use `break-word` on the name cell only, add `nowrap` and min widths. |
| Three overlapping stylesheets set the same selectors | `app.css`, `primitives.css`, `index.css` | Later files override earlier ones. New styles go into new files loaded last. A rule that a new file overrides is deleted from the old file in the same task. |
| `<DisplaySettings />` renders after `<main>` on every page | `App.tsx` | It moves into the Settings page. Tests that assert "after main, same on every path" change (see Test compatibility). |
| `<h1>AeroBrief</h1>` and a tagline inside `<main>`, plus a brand `<span>` in the header | `App.tsx` | The brand becomes the only `<h1>`. The tagline moves to the Status page subtitle. |
| `tokens.css` and `palette.ts` are frozen by SHA-256 hashes | `tests/flags-off-guard.test.ts` | A palette retune fails that test. The same commit updates the hashes (D3, approved). |
| `--shadow-card` is defined in `tokens-phase2.css`, not `tokens.css` | styles | Cards use borders, not shadows, so the token is no longer needed for cards. |
| `.nav-bar button` (Sign out) has no class and inherits the global `button` style | `SignOutButton.tsx`, `app.css` | Style it by selector `.nav-bar button`, no DOM change. |
| `vite.config.ts` blanks CSS unless it matches `css.include` | `vite.config.ts` | The CSS regression test needs the new files added to that regex. |

## Architecture

### Files

New:

| File | Purpose |
|---|---|
| `apps/web/src/lib/settings-sections.ts` | Pure functions: section ids, labels, `visibleSections`, `resolveSection`. |
| `apps/web/src/hooks/use-location-hash.ts` | Returns `window.location.hash` and updates on `hashchange`. |
| `apps/web/src/components/SettingsMenu.tsx` | The `<nav aria-label="Settings sections">` list. |
| `apps/web/src/components/AccountSection.tsx` | The Account section moved from `WatchlistPage` (heading, help text, "Delete account", `ConfirmDialog`). |
| `apps/web/src/pages/SettingsPage.tsx` | The page. |
| `apps/web/src/styles/shell.css` | Header, nav, container, footer. |
| `apps/web/src/styles/tables.css` | Both Airport_Tables, wide and stacked. |
| `apps/web/src/styles/controls.css` | Buttons, pills, form controls, touch targets. |
| `apps/web/src/styles/settings.css` | Settings layout, menu, tab bar, panes. |
| `apps/web/src/styles/surfaces.css` | Cards, type scale, spacing for the remaining pages. |

Changed: `App.tsx` (route, shell, remove global `DisplaySettings`), `NavBar.tsx` (one link), `WatchlistPage.tsx` (sections removed), `DisplaySettings.tsx` (heading `h2` to `h3`), `AirportTable.tsx` and `WatchlistTable.tsx` (class name on `<table>`), `AirportWatchRow.tsx` (button variants), `StatusPage.tsx` (subtitle), `tokens.css`, `palette.ts`, `themes.css`, `themes.ts`, `main.tsx` (imports), `vite.config.ts` (`css.include`), `tests/flags-off-guard.test.ts` (two hashes), and the existing tests listed under Test compatibility.

CSS load order in `main.tsx`: `tokens.css`, `tokens-phase2.css`, `themes.css`, `app.css`, `primitives.css`, `display-settings.css`, `webhook-settings.css`, `digest-settings.css`, `index.css`, then `shell.css`, `tables.css`, `controls.css`, `settings.css`, `surfaces.css`. The new files come last, so they win at equal specificity.

Layering rules from `structure.md` hold: no business logic in components, `lib/` holds pure functions, pages call hooks, no new imports across `apps/web` boundaries.

## Components and Interfaces

### `lib/settings-sections.ts`

```ts
import type { Features } from "../features/features-schema";

export const SECTION_IDS = ["display", "digest", "webhooks", "account"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const SECTION_LABELS: Readonly<Record<SectionId, string>> = {
  display: "Display",
  digest: "Daily digest",
  webhooks: "Webhooks",
  account: "Account",
};

/** Visible sections in fixed order. "account" is always present, so the list is never empty. */
export function visibleSections(features: Features): SectionId[] {
  return SECTION_IDS.filter((id) => {
    if (id === "display") return features.darkMode || features.highContrast;
    if (id === "digest") return features.digests;
    if (id === "webhooks") return features.webhooks;
    return true;
  });
}

/** `hash` is `window.location.hash`, for example "#webhooks". Any other input falls back to the first visible section. */
export function resolveSection(hash: string, visible: readonly SectionId[]): SectionId {
  const wanted = hash.startsWith("#") ? hash.slice(1) : hash;
  const match = visible.find((id) => id === wanted);
  return match ?? visible[0] ?? "account";
}
```

### `SettingsMenu`

```ts
export interface SettingsMenuProps {
  sections: readonly SectionId[];
  active: SectionId;
}
// <nav aria-label="Settings sections" className="settings-menu">
//   <ul>{sections.map(id => <li><a href={`#${id}`} aria-current={id === active ? "true" : undefined}>{SECTION_LABELS[id]}</a></li>)}</ul>
// </nav>
```

Native links only. Tab moves between links, Enter follows the link, the hash changes, the page switches. Focus stays on the clicked link.

### `AccountSection`

```ts
export interface AccountSectionProps {
  removeAccount: () => Promise<boolean>;
  onDeleted: () => void;
}
```

Holds only the `confirming` UI state. The markup is the current Account block (`<section aria-labelledby="account-heading">`, `h3` "Account", help text, `danger-outline` "Delete account", `ConfirmDialog`). `SettingsPage` passes `removeAccount` from `useWatchlist()` and `onDeleted={() => window.location.assign("/")}`.

### `SettingsPage`

```tsx
export function SettingsPage() {
  const features = useFeatures();
  const hash = useLocationHash();
  const { watchlist, loading, unauthorized, error, removeAccount } = useWatchlist();
  const sections = visibleSections(features);
  const active = resolveSection(hash, sections);
  // Always: PageHeader, ErrorRegion(error when not 401), .settings grid with SettingsMenu + one pane per visible section.
  // Display pane: always mounts DisplaySettings (theme settings live in the browser, so no session is needed).
  // Digest, Webhooks, Account panes:
  //   loading      -> LoadingState "Loading your settings…", Section not mounted
  //   unauthorized -> ErrorRegion "Sign in to manage your settings." + link "Go to sign in", Section not mounted
  //   otherwise    -> the Section
}
```

The signed-out and loading notices come from one small `SessionGate` helper inside `SettingsPage.tsx` that wraps the three session-bound Sections. Because the other panes are `hidden` unless active, a signed-out visitor sees the notice only in the pane they open.

Each visible section renders inside `<div id={`settings-pane-${id}`} className="settings__pane" hidden={id !== active}>`. All visible sections stay mounted, so the one-time webhook signing secret and unsaved digest input survive a switch. Digest and Webhooks fetch on mount, as they do on the Watchlist page today. `DigestSettings` receives `watchlistCount={loading ? null : watchlist.length}`.

`useWatchlist()` is reused for the session check, the digest count and `removeAccount`. `NavBar` already calls `loadWatchlist()`, which shares one in-flight request, so `/settings` sends one `GET /api/watchlist`.

### Wireframes

Wide viewport (at least 641 px):

```
header   AeroBrief (h1)                       Status  Watchlist  Settings  Sign out
main     h2 Settings
         Manage how AeroBrief looks and what it sends you.
         | Display       | Card: h3 Display settings                    |
         | Daily digest  |   Theme  (o) System ( ) Light ( ) Dark       |
         | Webhooks      |   [x] High contrast                          |
         | Account       |                                              |
footer   Data source ... License ... Built with Kiro
```

Narrow viewport (at most 640 px):

```
AeroBrief
Status  Watchlist
Settings  Sign out            <- nav wraps, each item 44 px high
Settings (h2)
[Display] [Daily digest]
[Webhooks] [Account]          <- tab bar wraps
Card: Display settings
```

### States (Settings page)

| State | Text | Mounted |
|---|---|---|
| Loading | "Loading your settings…" in the Daily digest, Webhooks and Account panes | menu and Display |
| Signed out (401) | "Sign in to manage your settings." and link "Go to sign in" in the Daily digest, Webhooks and Account panes | menu and Display |
| Other load error | the error text above the menu | menu and sections |
| Empty | not applicable, Account always exists | |
| Delete failed | "Could not delete your account. Try again." | menu and sections |
| Success | per-section messages (digest "Digest settings saved.", webhook messages), unchanged | |

## Routing and deep links

`App.tsx` gets `case "/settings": return <SettingsPage />;`.

**Deep link format: hash (`/settings#webhooks`). Recommended.**

- `App.tsx` matches the exact pathname. A path form (`/settings/webhooks`) needs prefix matching, a new case for unknown subpaths, and a Not found decision for `/settings/foo`.
- A hash never reaches the server, so Vercel needs nothing. The browser also handles Back and Forward through `hashchange`.
- The hash form needs no change to `AuthCallbackPage` or `signin-flash` (`consumeSigninFlash` already preserves the hash).
- Cost: the active section is not visible to the server. That does not matter for a signed-in page with no server rendering.

**Vercel.** `apps/web/vercel.json` already ends with `{ "source": "/(.*)", "destination": "/index.html" }`, after the `/api/:path*` rule. `/airport/ATL` works with no explicit entry, so `/settings` needs none. The explicit entries for `/watchlist` and others are redundant. A small test (task 8.3) pins the catch-all.

## App shell

```tsx
<header className="site-header">
  <div className="site-header__inner">
    <h1 className="site-header__brand">AeroBrief</h1>
    <NavBar pathname={pathname} />
  </div>
</header>
<main>{pageFor(pathname, digests)}</main>
<Footer />
```

The `<span>` becomes an `<h1>` and the `<h1>` and tagline inside `<main>` are removed. `app.test.tsx` and `auth-pages.test.tsx` still find exactly one `h1` with the text "AeroBrief". `StatusPage` passes `subtitle="FAA ground stop status for 20 major US airports."` to `PageHeader`.

Layout tokens added to `tokens.css`: `--layout-max: 1120px`, `--gutter: 16px` (24px at Wide). `.site-header__inner`, `main` and `.site-footer__inner` share `max-width: var(--layout-max); margin-inline: auto; padding-inline: var(--gutter)`. `index.css` rules that set 1000 px and 2rem are deleted.

Header: raised surface, 1px `color-table-rule` bottom border, brand `--text-lg` 700. Nav links: `min-height: 44px`, `padding-inline: var(--space-3)`, `white-space: nowrap`, `border-radius: var(--radius-sm)`. The current page link gets `font-weight: 600`, a 3px bottom border and an `accent-surface` background (text, border and weight carry the state; color repeats it). `.nav-bar button` gets the same box. At Narrow, `.site-header__inner` is a column and `.nav-bar__list` wraps.

## Tables

Class names only: `AirportTable` adds `airport-table--status`, `WatchlistTable` adds `airport-table--watchlist` to the `<table>`.

Wide (default) rules in `tables.css`:

```css
.airport-table { width: 100%; border-collapse: collapse; background: var(--color-surface-raised);
  border: 1px solid var(--color-table-rule); border-radius: var(--radius-md); overflow: hidden; box-shadow: none; }
.airport-table th, .airport-table td { padding: var(--space-2) var(--space-4); font-size: var(--text-sm);
  text-align: left; border-bottom: 1px solid var(--color-table-rule); overflow-wrap: normal; }
.airport-table thead th { white-space: nowrap; font-size: var(--text-xs); text-transform: uppercase;
  letter-spacing: .05em; color: var(--color-table-muted); background: var(--color-table-head-bg); }
.airport-table__name { overflow-wrap: break-word; }               /* the only cell allowed to break */
.airport-table--status tbody td:last-child,
.airport-table--watchlist tbody td { white-space: nowrap; width: 1%; }  /* shrink to content */
.airport-table--status tbody td:last-child .airport-table__detail { white-space: normal; }
```

The Status column holds the pill and the ground stop details line, so only the pill is `nowrap` there. The details line stays `normal` and wraps at word boundaries.

Narrow rules (`@media (max-width: 640px)`):

```css
.airport-table, .airport-table tbody, .airport-table caption { display: block; }
.airport-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.airport-table tbody tr { display: grid; column-gap: var(--space-3); row-gap: var(--space-2);
  padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--color-table-rule); }
.airport-table th, .airport-table td { display: block; min-width: 0; padding: 0; border: 0; width: auto; }
.airport-table--status tbody tr    { grid-template-columns: auto minmax(0, 1fr); }
.airport-table--status tbody td:last-child { grid-column: 1 / -1; }          /* pill + details on line 2 */
.airport-table--watchlist tbody tr { grid-template-columns: minmax(0, 1fr) auto; }
.airport-table--watchlist tbody th { grid-column: 1 / -1; }                  /* name + id on line 1 */
.airport-table--watchlist tbody td:last-child { justify-self: end; }         /* button at the right */
.airport-table tbody th a { display: inline-flex; align-items: center; min-height: 44px; min-width: 44px; }
```

`thead` is clipped, not `display: none`, so the column names stay in the accessibility tree. The Status row has two cells after the code and name, so the grid has code, name, then a full-width status cell. The Watchlist row has `th`, pill cell, button cell.

At 320 px a Status row has 320 - 32 (main padding) - 32 (row padding) = 256 px. "No ground stop reported" at 12 px with icon and padding is about 180 px, so the nowrap pill fits.

**Risk R1.** Changing `display` on table parts can remove table semantics in Safari and VoiceOver. The owner accepted CSS-only first (D6) and checks on a real iPhone (task 10). Only if that check finds VoiceOver loses table semantics, add `role="table|rowgroup|row|columnheader|rowheader|cell"` attributes (Requirement 9.6). That is an attribute-only DOM change, and no test asserts roles on these elements today.

## Controls, pills and touch targets

`controls.css` owns these rules:

```css
.btn { white-space: nowrap; }
.airport-table .btn { min-width: 5.5rem; }
.status-pill { white-space: nowrap; flex: none; }
.nav-bar a, .nav-bar button, .settings-menu a { min-height: 44px; display: inline-flex; align-items: center; }
select, .text-input { min-height: 44px; }
.display-settings__option, .digest-settings__option { min-height: 44px; }   /* label is the hit area */
@media (max-width: 640px), (pointer: coarse) { a.standalone, .site-footer a, .page-header__action a { min-height: 44px; display: inline-flex; align-items: center; } }
```

Row buttons: "Add" uses `secondary`, "Remove" uses `ghost`. The Watchlist page then has no primary Button, so the "one primary per view" rule holds. On the Settings page only "Save digest settings" is primary, and only the Daily digest pane shows at a time (others are `hidden`). The Webhooks pane has secondary buttons only, as `webhook-settings.test.tsx` already asserts.

Radios and checkboxes keep the native input and use the surrounding `<label>` as the 44 px hit area. Text links inside sentences (for example "Go to sign in" inside a paragraph) are exempt.

## Palette and themes

**Principle.** Quieter means fewer saturated colors: a neutral slate page and surface set, one desaturated accent (`#1e40af`), status colors only on pills, banners and the hero value, always next to text. Decorative borders (Cards, table rows, header) use the existing `color-table-rule`. Interactive boundaries (inputs, secondary buttons) keep `color-border`, which already passes 3:1.

**Starting values** (approved as the starting point, D10; the owner reviews them on a Vercel Preview of `phase-2` before `main`; the contrast tests decide, so adjust a token, never a threshold):

| Token | Light now | Light proposed | Dark now | Dark proposed |
|---|---|---|---|---|
| `color-page` | `#f8fafc` | `#f4f6f8` | `#0f172a` | `#0f141b` |
| `color-surface` | `#f3f5f7` | `#eef1f5` | `#131c2e` | `#151b24` |
| `color-surface-raised` | `#ffffff` | unchanged | `#172033` | `#1a212c` |
| `color-accent`, `color-link`, `color-focus` | `#1d4ed8` | `#1e40af` | unchanged | unchanged |
| `color-table-muted` | `#64748b` | `#566478` | `#94a3b8` | unchanged |
| `color-table-head-bg` | `#f8fafc` | unchanged | `#111a2c` | `#131a24` |
| `color-chip-bg` | `#f1f5f9` | unchanged | `#1e293b` | `#232b38` |

I computed these pairs by hand: `#1e40af` on white 8.72:1, on `#f4f6f8` 8.05:1, on `accent-surface` 7.15:1; `#566478` on `#f8fafc` 5.75:1; `#a3b1c6` on `#1a212c` 7.44:1; `#7b879a` on `#1a212c` 4.45:1; `#94a3b8` on `#131a24` 6.82:1. One finding: `#64748b` on a darker head background (`#f6f8fa`) drops to 4.47:1, so the header background stays `#f8fafc` in light. Task 4.1 re-runs every pair.

`color-bg`, the legacy keys and the status colors may change only if a pair fails or the new surfaces need it. Every change is made in all four places (`tokens.css`, `palette.ts`, `themes.css`, `themes.ts`), because `palette-sync` and `themes-sync` tests enforce equal values.

**High contrast.** The `hc-light` and `hc-dark` palettes keep their values, because the AAA constraint ties `color-focus` to every background and a retune is risky. They adopt the new look through structural rules in `themes.css`: add the new classes (`.settings-menu a`, `.settings__pane`, `.site-header`, `.airport-table`, Cards) to the existing `html[data-theme^="hc-"]` border-width rules, so Cards and menu items get 2px borders and the 3px focus outline. In `hc-*`, `color-table-rule` is `#595959` / `#bfbfbf`, so the thin borders become strong automatically.

**Pairs.** Every foreground/background combination that a new rule uses must be in `palettePairs`. Most already are (`text-primary` on `surface-raised`, `accent` on `accent-surface`, `table-muted` on `table-head-bg`, `chip-text` on `chip-bg`). Task 8.1 audits the new files and adds any missing pair, which then runs in `light`, `dark` and, at AAA, `hc-light` and `hc-dark` through `themePairs`.

**Frozen guard.** `tests/flags-off-guard.test.ts` says "if a change legitimately needs these files, that is a spec change, not a hash update". This spec is that spec change. Task 4.1 recomputes both hashes with the documented method (LF-normalized SHA-256) and updates the guard comment so that the baseline is the refresh commit. The owner approved this (D3), and D8 lifts the Phase 2 guardrail on editing these files.

## Test compatibility

Existing tests that must change, and the only edit allowed in each:

| Test file | Edit |
|---|---|
| `test/components/nav-bar.test.tsx`, `test/a11y/nav-bar.test.tsx` | Add the Settings link assertion. The control count signed in goes from 3 to 4. Nothing else. |
| `test/display-settings.test.tsx` | Mount at `/settings` (signed in and signed out, because Display needs no session). Heading level 2 becomes 3. Replace "sits after main and before the footer" with "sits inside main on /settings and is absent on /". Replace "is the same on %s" with the single `/settings` path. |
| `test/webhook-settings.test.tsx`, `test/digest-settings.test.tsx`, `test/digest-flags-off.test.tsx` | Open `/settings#webhooks` or `/settings#digest` instead of `/watchlist`. Find the Account section by role "region" and name "Account", because the menu also contains the text "Account". |
| `test/components/watchlist-page-layout.test.tsx` | Move the "deletes the account through the confirm dialog" case to `test/components/settings-page.test.tsx` and `account-section.test.tsx`. |
| `test/a11y/watchlist.test.tsx`, `a11y/webhooks.test.tsx`, `a11y/digest.test.tsx`, `a11y/display-settings.test.tsx` | Re-point to the Settings page for moved sections. Inspect each file first. |
| `test/a11y/themes/all-variants.test.tsx` | Replace the "Watchlist with digest and webhook sections" case with a plain Watchlist case. Add Settings cases for each Section. |
| `tests/flags-off-guard.test.ts` | Two hashes and the comment. |

Unchanged and must keep passing: `status-view.test.tsx` (20 rows, no `svg`, `img`, "map"), `status-banners`, `status-view-states`, `app.test.tsx`, `auth-pages.test.tsx` (one `h1` "AeroBrief"), `shared-watchlist.test.tsx` (one `GET /api/watchlist` at `/watchlist`), `button.test.tsx`, `confirm-dialog.test.tsx`, `palette-sync`, `themes-sync`, `contrast`, `themes-contrast`.

## Data Models

The refresh adds no database table, API route or stored data. It uses these shapes:

| Shape | Definition | Source |
|---|---|---|
| `Features` | `{ darkMode, highContrast, digests, webhooks }`, four booleans | `features/features-schema.ts`, unchanged |
| `SectionId` | `"display" \| "digest" \| "webhooks" \| "account"` | `lib/settings-sections.ts`, new |
| Settings hash | `window.location.hash`, one of `#display`, `#digest`, `#webhooks`, `#account`, otherwise ignored | URL only, never stored |
| Theme and contrast preference | `aerobrief.theme` and `aerobrief.contrast` in local storage | `ThemeController.tsx`, unchanged |
| Palette | `palette`, `darkPalette`, `hcLightPalette`, `hcDarkPalette`, `palettePairs` | `palette.ts`, `themes.ts`, values retuned |
| Layout tokens | `--layout-max`, `--gutter` | `tokens.css`, new |

## Error handling

- Settings 401 keeps the menu and the Display Section, shows the sign-in state in the Daily digest, Webhooks and Account panes, and mounts none of those three Sections, so no 401 floods from Digest and Webhooks requests.
- Settings non-401 load error shows the text and keeps the menu, so the user can still reach Account and Display.
- A hash that names a hidden or unknown Section falls back to the first Visible_Section with no message. The URL is not rewritten.
- Each moved Section keeps its own loading, error and retry text.
- CSS never hides content to avoid overflow. No `overflow-x: hidden` on `html`, `body` or `main`.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Reflection on redundancy: the membership, order and "never empty" rules share one function, so they form one property. Hash fallback and the deep-link round trip are separate, because one covers arbitrary input and the other covers valid input. The contrast property already exists as table-driven tests, so the task only extends its input list. CSS, layout and touch-target rules are not universal properties over generated input, so they are example tests and a manual check.

### Property 1: Visible sections follow the flags

For any combination of the four Feature_Flags, `visibleSections` SHALL return a subsequence of `display, digest, webhooks, account` in that order, SHALL contain `account`, SHALL contain `display` if and only if `darkMode` or `highContrast` is true, SHALL contain `digest` if and only if `digests` is true, and SHALL contain `webhooks` if and only if `webhooks` is true.

**Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6, 1.7**

### Property 2: Hash resolution always lands on a visible section

For any combination of Feature_Flags and any string used as the hash, `resolveSection` SHALL return an id that is in the visible list, and SHALL return the first visible id when the hash does not name a visible section.

**Validates: Requirements 2.1, 2.2**

### Property 3: Deep link round trip

For any combination of Feature_Flags and any visible section id, `resolveSection("#" + id, visibleSections(flags))` SHALL return `id`.

**Validates: Requirements 2.1**

### Property 4: Every palette pair meets its threshold in every theme

For any Theme_Variant and any pair in the pair list of that variant, the contrast ratio SHALL be at least 4.5:1 for `normal`, 3:1 for `large` and `ui` in `light` and `dark`, and at least 7:1 for `normal` and 4.5:1 for `large` and `ui` in `hc-light` and `hc-dark`.

**Validates: Requirements 13.1, 13.2, 13.3**

## Testing Strategy

- **Property tests** (fast-check, at least 100 runs, tag `Feature: ui-refresh, Property N: ...`): Properties 1 to 3 in `test/settings-sections.pbt.test.ts`. Property 4 is the existing `contrast.test.ts` and `themes-contrast.test.ts` loops over `palettePairs` and `themePairs`; the new pairs join those loops.
- **Component tests** (Testing Library): `settings-page.test.tsx` (visibility per flag, no request for a hidden Section, hash on load, `hashchange`, focus not moved, panes mounted and `hidden`, webhook secret survives a switch, `aria-current`, pane ids differ from section ids, loading, 401, other error, delete success and failure, Tab order of the menu), `settings-menu.test.tsx`, `account-section.test.tsx`, shell test (one `h1`, no tagline in `main`, Status subtitle), nav test (Settings link).
- **axe**: Settings with each Section active, in all four themes, flags on, in `all-variants.test.tsx`. jsdom cannot compute color-contrast, so the pair tests cover contrast.
- **CSS regression test** (`test/layout-css.test.ts`): reads the new stylesheets (`?raw`, with `css.include` extended) and asserts: no `overflow-wrap: anywhere` or `word-break: break-all` in any `.airport-table` rule; `thead th` has `white-space: nowrap`; `.btn` and `.status-pill` have `white-space: nowrap`; `.status-pill` has `flex: none`; row buttons have `min-width: 5.5rem`; a `@media (max-width: 640px)` block contains `display: grid` for `.airport-table` rows and the clipped `thead`; Touch_Target `min-height: 44px` rules exist; `[hidden]` panes are `display: none`; no raw hex color in the new files; no `overflow-x: hidden` on `html`, `body` or `main`.
- **Vercel test**: the last rewrite is `/(.*)` to `/index.html` and follows `/api/:path*`.
- **Manual**: browser device emulation at 320, 375, 390, 430 and 1024+, then the owner's phone. Browser automation tools are outside the approved stack, so layout cannot be asserted in jsdom.
- **Commands**: `npm test`, `npm run typecheck`, `npm run build -w @aerobrief/web`.

## Decisions (approved 2026-11-24)

The owner approved every recommendation.

- **D1:** One "Settings" link is added to the Nav_Bar. Only the nav tests change for it.
- **D2:** Deep links use the hash: `/settings#display`, `#digest`, `#webhooks`, `#account`.
- **D3:** The palette is retuned in `tokens.css` and `palette.ts`, and the two SHA-256 hashes in `tests/flags-off-guard.test.ts` are updated in the same commit.
- **D4:** Signed-out visitors see the Display Section on `/settings`. Daily digest, Webhooks and Account show the sign-in state. This replaces the earlier "whole page sign-in" wording.
- **D5:** Watchlist row "Add" is `secondary`, "Remove" is `ghost`. The page has no primary Button.
- **D6:** CSS `display` overrides for stacked tables are accepted. ARIA roles are added only if the owner's phone check (task 10) finds that VoiceOver loses table semantics.
- **D7:** The header brand is the single `<h1>`. The tagline moves to the Status page subtitle.
- **D8:** This refresh supersedes Phase 2 Requirements 3, 8.1, 9.7, 9.12 and 10.1, and the Phase 2 guardrail against editing `tokens.css`, `palette.ts` and existing tests. Task 0 records this in `docs/decisions.md` and adds a one-line pointer above each affected Phase 2 requirement. The Phase 2 spec is not otherwise rewritten.
- **D9:** The refresh ships to `main` before December 4, 2026, 2:00 PM PT, unflagged. Rollback is `git revert` of the refresh commit range. It is MVP polish, not a Phase 2 item, so the "contest set only" merge rule does not cover it. Task 0.1 records the owner's approval in `docs/decisions.md`.
- **D10:** The palette values in this document are the starting point. The owner reviews them on a Vercel Preview of `phase-2` before `main` (task 10). A Preview is built only when a push changes files under `apps/web`, and the owner cannot use Vercel's Redeploy button (2FA), so every Preview needs a push that touches `apps/web`.
- **D11:** Content max width is 1120 px.
