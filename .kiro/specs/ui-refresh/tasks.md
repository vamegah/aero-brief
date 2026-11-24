# Implementation Plan: UI Refresh

## Overview

Build a Settings page, an app shell and a quieter palette, and fix the table and control layout on phones. All code is TypeScript (strict) in `apps/web`, plus two hashes in `tests/flags-off-guard.test.ts`. Work happens on branch `phase-2`. Order: pure logic, Settings page and wiring, palette, shell, tables and controls, page styles, verification, Status dashboard (tasks 11 to 14), owner check on a phone (task 10, last).

**Guardrails for every task.**

- Never read or print `.env`, `.env.backup` or any `.dev.vars` file.
- Do not commit, push, tag or deploy. The owner fast-forwards and pushes `main`.
- Do not edit `.kiro/specs/aerobrief/`. Do not edit `.kiro/specs/aerobrief-phase2/`, except for the one-line pointers that task 0.2 adds.
- Add no dependency. Icons stay inline SVG or CSS `mask-image` on `aria-hidden` spans. Nothing inside the status view may be an `<svg>` or `<img>`.
- Restyle with CSS and class names. Do not change the DOM of the airport tables, banners, nav bar or `aria-live` region, except for the one Settings link (task 2.4) and the two table class names (task 6.1).
- Never lower a contrast threshold. Fix the token.
- When a new stylesheet redefines a rule that exists in `app.css`, `primitives.css` or `index.css`, delete the old rule in the same task.
- The owner approved decisions D1 to D11 on 2026-11-24 (see `design.md`, "Decisions (approved 2026-11-24)"). No task waits for further approval, except the conditional ARIA roles fallback in task 10 (D6).
- The Phase 2 guardrail against editing `tokens.css`, `palette.ts` and existing tests does not apply to this work (D8). Existing tests change only as listed in `design.md` ("Test compatibility").
- A task marked **needs user action** cannot be done by the agent. Stop and tell the owner the exact step.
- Existing tests change only as listed in `design.md` ("Test compatibility").

## Tasks

- [x] 0. Record the owner's decisions (docs only)
  - [x] 0.1 Record the decisions in `docs/decisions.md`
    - Append a section "2026-11-24: UI refresh decisions" that lists D1 to D11 from `design.md` in one line each.
    - State that D8 supersedes Phase 2 Requirements 3, 8.1, 9.7, 9.12 and 10.1 and the Phase 2 guardrail against editing `tokens.css`, `palette.ts` and existing tests, for this refresh only.
    - State that, per D9, the refresh is MVP polish approved by the owner on 2026-11-24, is not a Phase 2 item, is therefore not covered by the "contest set only" merge rule in `scope.md`, ships unflagged to `main` before December 4, 2026, 2:00 PM PT, and rolls back with `git revert` of the refresh commit range.
    - Edit no other part of the file. Do not read or print `.env` or `.dev.vars`.
    - _Requirements: 13.7, 15.1_

  - [x] 0.2 Add pointers to the affected Phase 2 requirements
    - In `.kiro/specs/aerobrief-phase2/requirements.md`, add one line directly under each of the headings of Requirements 3, 8, 9 and 10: `> Superseded in part by the UI refresh (owner decision of 2026-11-24): <scope>. See .kiro/specs/ui-refresh/requirements.md.` Use these scopes: Requirement 3 "the flags-off look (same behavior, not same pixels, and the tokens.css, palette.ts and existing-test guardrail)"; Requirement 8 "criterion 8.1"; Requirement 9 "criteria 9.7 and 9.12"; Requirement 10 "criterion 10.1".
    - Rewrite nothing else in the Phase 2 spec. Run `validate_spec_format` on the file afterwards.
    - _Requirements: 13.7_

- [x] 1. Settings section logic
  - [x] 1.1 Implement `apps/web/src/lib/settings-sections.ts` and `apps/web/src/hooks/use-location-hash.ts`
    - Export `SECTION_IDS`, `SectionId`, `SECTION_LABELS`, `visibleSections(features)` and `resolveSection(hash, visible)` as in `design.md`.
    - `useLocationHash()` returns `window.location.hash`, subscribes to `hashchange`, and unsubscribes on unmount.
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3_

  - [x] 1.2 Write property tests for section logic
    - Create `apps/web/test/settings-sections.pbt.test.ts` with fast-check, `numRuns` of 100 or more, tag `// Feature: ui-refresh, Property N: ...`.
    - **Property 1: Visible sections follow the flags**
    - **Property 2: Hash resolution always lands on a visible section** (use `fc.string()` and hashes with and without `#`)
    - **Property 3: Deep link round trip**
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2**

  - [x] 1.3 Write unit tests for section logic and the hash hook
    - Create `apps/web/test/settings-sections.test.ts` with the four flag-off, each-flag-on and all-on examples, `""`, `"#"`, `"#nope"`, `"#webhooks"` with the flag off.
    - Test `useLocationHash` updates on `hashchange` and removes its listener on unmount.
    - _Requirements: 1.7, 2.2, 2.3_

- [x] 2. Settings page and wiring
  - [x] 2.1 Create `AccountSection`
    - Create `apps/web/src/components/AccountSection.tsx` with the Account markup from `WatchlistPage.tsx` (`<section aria-labelledby="account-heading">`, `h3` "Account", help text "Permanently delete your account and watchlist.", `danger-outline` "Delete account", `ConfirmDialog` with the same labels). Props: `removeAccount: () => Promise<boolean>`, `onDeleted: () => void`. Own only the `confirming` state.
    - Create `apps/web/test/components/account-section.test.tsx`: opens the dialog, Cancel closes it, Confirm calls `removeAccount` and then `onDeleted` on true, stays open and does not call `onDeleted` on false.
    - _Requirements: 3.5, 3.6, 1.9_

  - [x] 2.2 Create `SettingsMenu`
    - Create `apps/web/src/components/SettingsMenu.tsx` as in `design.md`: `<nav aria-label="Settings sections" className="settings-menu">`, a `<ul>`, native `<a href="#id">` links, `aria-current="true"` on the active link only.
    - Create `apps/web/test/components/settings-menu.test.tsx`: link order, labels, hrefs, `aria-current` on one link, Tab order follows DOM order, no link has `tabindex="-1"`.
    - _Requirements: 1.2, 2.5, 11.5_

  - [x] 2.3 Create `SettingsPage`
    - Create `apps/web/src/pages/SettingsPage.tsx` as in `design.md`. Use `useFeatures`, `useLocationHash`, `useWatchlist`, `visibleSections`, `resolveSection`.
    - States (D4): the menu and the Display Section render in every state, because theme settings live in the browser. While loading, the Daily digest, Webhooks and Account panes show "Loading your settings…" and mount no Section. On 401, those three panes show `ErrorRegion` "Sign in to manage your settings." and a link "Go to sign in" to `/sign-in` and mount no Section. Other errors show the text above the menu and keep every Section. Use one small `SessionGate` helper inside the file for the three session-bound panes.
    - Panes: `<div id="settings-pane-<id>" className="settings__pane" hidden={id !== active}>`. All Visible_Sections stay mounted. Pass `watchlistCount={loading ? null : watchlist.length}` to `DigestSettings`. Do not mount a Section whose flag is off.
    - Change the `DisplaySettings` heading from `h2` to `h3` (keep the id, class names and text).
    - Header: `PageHeader` title "Settings", subtitle "Manage how AeroBrief looks and what it sends you."
    - Create `apps/web/test/components/settings-page.test.tsx`: visibility per flag (all off shows Account only, each flag, all on); a hidden Section sends no request; hash on load; `hashchange` switches the pane without moving focus; inactive panes are mounted with `hidden`; the webhook signing secret is still shown after switching away and back; `aria-current`; pane ids differ from section ids; loading, 401, 500 and delete success and failure states; the Daily digest hint "Add an airport to receive a digest" at 0 airports; one `GET /api/watchlist` request. Signed out (401): Display is mounted and usable, the Daily digest, Webhooks and Account panes show the sign-in state, and none of those three Sections is mounted (no digest or webhook request is sent). Loading: the same three panes show "Loading your settings…". With only `darkMode` off and `highContrast` off, signed out shows the menu with Account only and the sign-in state.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 14.1, 14.4_

  - [x] 2.4 Wire the route, the nav link and the slimmer Watchlist page
    - Decision D1: add one link `{ href: "/settings", label: "Settings" }` after "Watchlist" in `NavBar.tsx`. Change nothing else in the nav DOM.
    - `App.tsx`: add `case "/settings": return <SettingsPage />;` and remove the global `<DisplaySettings />`.
    - `WatchlistPage.tsx`: remove `DigestSettings`, `WebhookSettings`, the Account section, `ConfirmDialog`, the `confirming` state and `onConfirmDelete`. Keep the sign-in flash, header with counter, error, loading, empty state, the table and the signed-out state. Drop `removeAccount` from the destructuring.
    - Update `test/components/nav-bar.test.tsx` and `test/a11y/nav-bar.test.tsx`: assert the Settings link and href, and change the signed-in control count from 3 to 4. No other nav assertion changes.
    - _Requirements: 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4, 15.3_

  - [x] 2.5 Update the existing tests for the moved sections
    - Apply the edits in `design.md` ("Test compatibility") to `test/display-settings.test.tsx`, `test/webhook-settings.test.tsx`, `test/digest-settings.test.tsx`, `test/digest-flags-off.test.tsx`, `test/components/watchlist-page-layout.test.tsx`, `test/a11y/watchlist.test.tsx`, `test/a11y/webhooks.test.tsx`, `test/a11y/digest.test.tsx`, `test/a11y/display-settings.test.tsx`. Read each file first.
    - In `test/display-settings.test.tsx`, cover `/settings` both signed in and signed out (401): the Display Section works in both (D4).
    - Change only the route (`/settings#...`), the fetch stub, heading level, region lookup by role and name, and placement assertions. Keep every behavior assertion of the moved components.
    - Add a Watchlist page test that none of "Display settings", "Daily digest", "Webhooks" and "Delete account" renders.
    - _Requirements: 4.2, 5.4, 16.2_

  - [x] 2.6 Add Settings to the axe theme matrix
    - In `test/a11y/themes/all-variants.test.tsx`: replace the case "Watchlist with digest and webhook sections" with a plain Watchlist case (ready when "Remove New York JFK from watchlist" shows). Add four Settings cases (`#display`, `#digest`, `#webhooks`, `#account`) with all flags on, signed in, ready when the pane's heading is visible. Update the matrix comment.
    - _Requirements: 16.3_

- [x] 3. Checkpoint - Settings page works
  - Run `npm test -w @aerobrief/web` and `npm run typecheck`. Ensure all tests pass, ask the user if questions arise.

- [x] 4. Palette
  - [x] 4.1 Retune light and dark tokens and update the guard
    - Decisions D3, D10 and D11 apply. The values in `design.md` are the starting point; the owner reviews them on a Vercel Preview in task 10.
    - Change the starting values in `design.md` ("Palette and themes") in `tokens.css`, `palette.ts`, `themes.css` and `themes.ts`, with identical lowercase hex in each pair of files. Leave `hc-light` and `hc-dark` values unchanged.
    - Add `--layout-max: 1120px` and `--gutter: 16px` (24px at `min-width: 641px`) to `tokens.css`.
    - Run `contrast`, `themes-contrast`, `palette-sync` and `themes-sync`. For any failing pair change the token, never the threshold.
    - Recompute the LF-normalized SHA-256 of `tokens.css` and `palette.ts` and update both hashes and the comment in `tests/flags-off-guard.test.ts`.
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.6, 13.7_

- [x] 5. App shell
  - [x] 5.1 Build the shell and scaffold the stylesheets
    - `App.tsx`: header brand becomes `<h1 className="site-header__brand">AeroBrief</h1>`; remove the `<h1>` and tagline from `<main>`.
    - `StatusPage.tsx`: `PageHeader` subtitle "FAA ground stop status for 20 major US airports."
    - Create `shell.css`, `tables.css`, `controls.css`, `settings.css`, `surfaces.css` in `apps/web/src/styles/` and import them in `main.tsx` after `index.css`, in that order.
    - Fill `shell.css`: shared `max-width: var(--layout-max)`, `margin-inline: auto`, `padding-inline: var(--gutter)` for `.site-header__inner`, `main`, `.site-footer__inner`; raised header with a 1px `color-table-rule` bottom border; row layout at Wide and column layout at Narrow; nav link and `.nav-bar button` box with `min-height: 44px`, `white-space: nowrap`, current page marker (weight 600, 3px bottom border, `accent-surface`); wrapping `.nav-bar__list`. Delete the superseded 1000 px and 2rem rules in `index.css` and the header and footer rules in `app.css` that `shell.css` redefines.
    - Add a shell test in `test/components/app-shell-headings.test.tsx`: one `h1` "AeroBrief" in the header on `/`, `/watchlist`, `/settings` and an unknown path; no `h1` or tagline text inside `main`; the Status page shows the subtitle.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.2, 10.3, 10.6_

- [x] 6. Tables and controls
  - [x] 6.1 Style the Airport_Tables wide and stacked
    - `AirportTable.tsx`: add `airport-table--status` to the `<table>` class. `WatchlistTable.tsx`: add `airport-table--watchlist`. No other DOM change.
    - Write `tables.css` with the wide and `@media (max-width: 640px)` rules in `design.md` ("Tables"). Delete every `.airport-table` rule from `app.css`, `primitives.css` and `index.css`, including both `overflow-wrap: anywhere` declarations, the sticky header, the striping and the `max-width: 480px` block, after moving anything still needed.
    - Run `status-view`, `status-page`, `airport-table-details`, `watchlist-and-sign-in` and `watchlist-page-layout` tests unchanged.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4, 9.5, 12.2, 15.3, 15.6_

  - [x] 6.2 Style pills, buttons and touch targets, and set the row button variants
    - `AirportWatchRow.tsx`: "Add" uses `variant="secondary"`, "Remove" uses `variant="ghost"`. Keep the names, labels and `disabled` behavior (decision D5).
    - Write `controls.css` as in `design.md` ("Controls, pills and touch targets"): nowrap and `flex: none` for `.status-pill`, nowrap for `.btn`, `min-width: 5.5rem` for table row buttons, 44 px targets at Narrow or coarse pointer for buttons, standalone links, menu links, labels, selects and inputs, full-width fields at Narrow. Delete the redefined `.btn`, `.status-pill` and `button` rules from `app.css`, `primitives.css` and `index.css`.
    - Extend the Watchlist page test from task 2.5: assert `.btn--secondary` on Add, `.btn--ghost` on Remove, and no `.btn--primary` on the page.
    - _Requirements: 4.4, 4.5, 10.1, 10.2, 10.3, 10.4, 10.5, 14.4_

- [x] 7. Page styles and themes
  - [x] 7.1 Style the Settings page
    - Write `settings.css`: `.settings` grid with a 14rem menu column at Wide and a single column at Narrow; vertical list at Wide, horizontal wrapping tab bar at Narrow; active item with bold text and a 3px underline (Narrow) or left border (Wide); `.settings__pane[hidden] { display: none; }`; `.settings__pane` as a Card.
    - Update `display-settings.css`, `digest-settings.css` and `webhook-settings.css`: remove `max-width: 960px`, `margin: ... auto` and the surface background and border (the pane is the Card); keep field and list rules; 44 px option labels and select; full-width fields at Narrow.
    - _Requirements: 7.1, 10.3, 10.5, 11.1, 11.2, 11.3, 11.4, 12.1_

  - [x] 7.2 Style Cards, type scale and the remaining pages
    - Write `surfaces.css`: Card rules (raised surface, 1px `color-table-rule`, `--radius-md`, no shadow) for `.summary-card`, `.event-card`, `.empty-state`, `.loading-state`; type scale from Requirement 7.3; spacing from tokens; `.page-header` wrapping; `.form` full width at Narrow; sign-in, unsubscribe, digest unsubscribe, airport detail and not-found layouts. Delete the redefined rules in `app.css`, `primitives.css` and `index.css`, including the `--shadow-card` uses.
    - Use `overflow-wrap: break-word` for long strings (emails, URLs, times), never `anywhere` on table cells, never `overflow-x: hidden` on `html`, `body` or `main`.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 12.1, 12.2, 12.3, 14.2_

  - [x] 7.3 Restyle the dark and high-contrast themes
    - `themes.css`: add the new classes (`.settings-menu a`, `.settings__pane`, `.site-header`, `.airport-table`, Card classes) to the `html[data-theme^="hc-"]` border-width and outline rules. Every new selector that mentions `hc-` starts with `html[data-theme`. Keep `prefers-color-scheme` and `prefers-contrast` out of the file.
    - Check the dark look against the new light surfaces (header, Cards, table, pills, menu).
    - Run `themes-sync` and `themes-contrast`.
    - _Requirements: 13.5, 13.6, 13.8_

- [x] 8. Verification
  - [x] 8.1 Audit palette pairs for the new stylesheets
    - List every foreground/background combination used by `shell.css`, `tables.css`, `controls.css`, `settings.css` and `surfaces.css`. Add any missing combination to `palettePairs` with the right size class. Fix failing pairs by changing tokens in all four places.
    - Run `contrast`, `themes-contrast`, `palette-sync`, `themes-sync`. If `palette.ts` changes, recompute the guard hash again (decision D3 covers this).
    - **Property 4: Every palette pair meets its threshold in every theme**
    - **Validates: Requirements 13.1, 13.2, 13.3, 13.4**

  - [x] 8.2 Add the CSS regression test
    - Extend `css.include` in `apps/web/vite.config.ts` to match the five new stylesheets.
    - Create `apps/web/test/helpers/css.ts` (rule lookup by selector and media block) and `apps/web/test/layout-css.test.ts` with the assertions in `design.md` ("Testing Strategy").
    - _Requirements: 8.1, 8.2, 8.3, 9.1, 10.1, 10.2, 10.3, 12.3, 16.5, 7.2_

  - [x] 8.3 Pin the Vercel catch-all rewrite
    - Create `apps/web/test/vercel-rewrites.test.ts`: import `../vercel.json?raw`, parse it, assert the last rewrite is `{ source: "/(.*)", destination: "/index.html" }` and that the `/api/:path*` rule comes before it.
    - _Requirements: 2.7_

- [x] 9. Final checkpoint - full suite
  - Run `npm test`, `npm run typecheck` and `npm run build -w @aerobrief/web` at the repository root. Ensure all tests pass, ask the user if questions arise.

- [x] 11. Dashboard logic (pure functions and shared constants)
  - [x] 11.1 Implement the event types, the filter and the section resolver
    - Create `apps/web/src/lib/event-types.ts` (`EVENT_TYPE_LABELS`, `KnownEventType`, `EVENT_TYPES`), `apps/web/src/lib/filter-events.ts` (`EventFilter`, `NO_EVENT_FILTER`, `filterEvents`) and `apps/web/src/lib/status-sections.ts` (`STATUS_SECTION_IDS`, `StatusSectionId`, `STATUS_SECTION_LABELS`, `resolveStatusSection`) exactly as in `design.md` ("Pure functions").
    - In `EventCard.tsx`, import `EVENT_TYPE_LABELS` for the labels. Keep the icons, modifiers, fallback "Event" and markup unchanged. `event-card.test.tsx` must pass unchanged.
    - `lib/` stays pure: no I/O, no React, no environment access.
    - _Requirements: 20.3, 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 18.1, 18.2_

  - [x] 11.2 Write property tests for the filter and the section resolver
    - Create `apps/web/test/filter-events.pbt.test.ts` and `apps/web/test/status-sections.pbt.test.ts` with fast-check, `numRuns` of 100 or more, tag `// Feature: ui-refresh, Property N: ...`.
    - **Property 5: A filtered list is an ordered subset of the input**
    - **Property 6: A filtered list holds exactly the events that match both values**
    - **Property 7: No filter returns every event and nothing is mutated**
    - **Property 8: A hash always resolves to a dashboard section**
    - Generate events with known and arbitrary type strings, airport codes from a small set and `null`, and filters from the same sets and `null`.
    - **Validates: Requirements 18.1, 18.2, 20.4, 20.5, 20.6, 20.7, 20.8, 20.9, 22.1, 22.2, 22.3, 22.4, 22.5, 22.6**

  - [x] 11.3 Write unit tests for the filter and the section resolver
    - Create `apps/web/test/filter-events.test.ts`: one airport, one type, both, a system-wide event kept under "all" and dropped under an airport, an unknown type kept only under "all types", empty input, input unchanged.
    - Create `apps/web/test/status-sections.test.ts`: `""`, `"#"`, `"#nope"`, `"#EVENTS"`, `"events"`, `"#events"`, `"#airports"`.
    - _Requirements: 18.1, 18.2, 22.2, 22.3, 22.5, 22.6, 23.1_

- [x] 12. Dashboard UI
  - [x] 12.1 Generalize the menu into `SectionMenu`
    - Create `apps/web/src/components/SectionMenu.tsx` as in `design.md` ("Components"). Rewrite `SettingsMenu.tsx` as a thin wrapper that keeps its props, the nav label "Settings sections", and the nav class `settings-menu`.
    - Rename every `.settings-menu` selector to `.section-menu` (and `.settings-menu__list` to `.section-menu__list`) in `settings.css`, `controls.css` and `themes.css`. Change no declaration. Update the same selectors in `apps/web/test/layout-css.test.ts`.
    - Create `apps/web/test/components/section-menu.test.tsx`: label, link order, hrefs, one `aria-current`, extra class, Tab order follows DOM order. `settings-menu.test.tsx` and `settings-page.test.tsx` pass unchanged.
    - _Requirements: 17.3, 17.6, 18.5_

  - [x] 12.2 Build the dashboard in `StatusView` and add `EventFilters`
    - Create `apps/web/src/components/EventFilters.tsx` as in `design.md`: a group "Filter events" with two native `<select>` elements labelled "Airport" and "Event type" through `FormLabel`; the value `""` means "All airports" or "All types"; airport options sorted by code on a copy; text `<code> – <name>`; type options from `EVENT_TYPES` and `EVENT_TYPE_LABELS`. No Button.
    - Restructure `StatusView.tsx` as in `design.md`: keep the live region, loading and empty states unchanged and first; when the status is ok render the `status-layout` with `SectionMenu` "Status sections", then three `status-pane` divs (ids `status-pane-overview`, `-events`, `-airports`, `hidden` unless active, DOM order Overview, Events, Airports). Use `useLocationHash` and `resolveStatusSection`.
    - Overview: `h3` "Overview", the `SummaryCard`, `h4` "Latest events", `EventList` of `events.slice(0, 5)`, and the link "View all events" to `#events` (class `standalone`). Events: `h3` "Events in the last 24 hours", the "Data as of" line, `EventFilters`, the line "Showing N of M events", the two empty states ("No events in the last 24 hours." and "No events match these filters."), and `EventList` of `filterEvents(events, eventFilter)`. Airports: `h3` "Airports", the "Data as of" line, then the existing filter group, search field, count, table and empty states with no change to their text or DOM. Remove the old `h2` "Events in the last 24 hours" and the trailing `EventList`.
    - Send no request on a filter change. Add no `svg`, `img`, text "map" or class name that contains "map". Render no primary Button.
    - Create `apps/web/test/components/status-dashboard.test.tsx` and `apps/web/test/components/event-filters.test.tsx` with the cases listed in `design.md` ("Testing Strategy"). Reset the hash in `afterEach`.
    - _Requirements: 17.1, 17.2, 17.8, 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 19.1, 19.2, 19.3, 19.4, 19.5, 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8, 20.9, 20.10, 20.11, 20.12, 20.13, 20.14, 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 23.2, 23.5_

  - [x] 12.3 Update the existing Status tests that use role queries
    - Apply the edits in `design.md` ("Test compatibility: Status dashboard") to `test/components/airport-filter.test.tsx`, `test/components/airport-search.test.tsx`, `test/a11y/status-filter.test.tsx` and `test/a11y/airport-search.test.tsx`: set the hash `#airports` before render and reset it after each test. Read each file first and change nothing else.
    - Run the unchanged tests named in that section and confirm they pass: `status-view`, `summary-card`, `status-page`, `status-view-states`, `status-banners`, `app-shell-headings`, `app`, `a11y/app-shell`, `shared-watchlist`, `event-card`.
    - _Requirements: 21.1, 23.4_

  - [x] 12.4 Add the Status sections to the axe suites
    - In `test/a11y/fixtures.ts`, add `okStatusWithEvents()`: the `NORMAL` airports plus three events (ground stop started at JFK, ground stop ended at ATL, a system-wide event with `airportId: null`) with `occurredAt` computed from `Date.now()` so they stay inside 24 hours.
    - In `test/a11y/themes/all-variants.test.tsx`: rename the "Status" case to "Status #overview" and give it events; add "Status #events" and "Status #airports" (set the hash with `window.history.replaceState` in `prepare`). Ready when the pane heading is visible. Update the matrix comment (15 pages, 60 cases).
    - In `test/a11y/status.test.tsx`: add axe cases for `#events` with events, `#events` after choosing a filter that matches nothing, and `#airports`. Reset the hash in `afterEach`.
    - _Requirements: 23.3_

- [x] 13. Dashboard styles and palette audit
  - [x] 13.1 Style the dashboard
    - `settings.css`: extend the layout selectors with the Status ones (`.settings, .status-layout`, `.settings__panes, .status-layout__panes`, in the base rule and in the `min-width: 641px` rule) and add `.status-pane[hidden] { display: none; }`. Do not create a new stylesheet.
    - `surfaces.css`: add `.event-filters`, `.data-as-of`, `.event-count` and pane spacing, with tokens only and no raw color. Selects fill the width at Narrow (the existing `controls.css` rule already does) and the Events pane causes no horizontal scroll at 320 px.
    - `themes.css`: no new `hc-*` rule is needed unless a new bordered surface appears; add one under `html[data-theme^="hc-"]` only if it does.
    - Extend `test/layout-css.test.ts` with the assertions in `design.md` ("Test compatibility: Status dashboard").
    - _Requirements: 17.4, 17.5, 17.6, 17.7, 20.1, 23.6_

  - [x] 13.2 Audit the palette pairs for the dashboard
    - List every foreground/background pair that the new rules in `settings.css` and `surfaces.css` use. Add any pair missing from `palettePairs` with the right size class and run `contrast`, `themes-contrast`, `palette-sync` and `themes-sync`. Fix a failing pair by changing the token in all four places, never the threshold.
    - Recompute and update the two hashes in `tests/flags-off-guard.test.ts` only if `tokens.css` or `palette.ts` changed. If neither changed, leave the guard alone.
    - _Requirements: 23.6_

- [x] 14. Checkpoint - dashboard works
  - Run `npm test`, `npm run typecheck` and `npm run build -w @aerobrief/web` at the repository root. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 23.8_

- [~] 10. Owner review on a Vercel Preview of `phase-2` (**needs user action**)
  - Runs last, after tasks 11 to 14 (owner decision of 2026-11-24), so that the owner reviews the whole refresh, including the Status dashboard, at once.
  - The owner pushes `phase-2`. A Preview is built only when the push changes files under `apps/web`, and the owner cannot use Vercel's Redeploy button (2FA). The refresh changes `apps/web`, so its push builds one. If a later fix changes nothing under `apps/web`, the agent tells the owner to include a change under `apps/web` in the push, so a new Preview is built.
  - Palette review (D10): the owner reviews the starting palette on the Preview in light and dark (and high contrast if the flag is on). Palette changes the owner asks for go back to task 4.1 and task 8.1 (and a new guard hash).
  - Layout check: the owner checks these pages at 320, 375, 390 and 430 px in browser device emulation, then on the iPhone: Status (signed out works; check `/#overview`, `/#events` and `/#airports`), one Airport detail, Watchlist, Settings (each section, signed in and signed out), Sign-in, Unsubscribe, Digest unsubscribe.
  - Dashboard check: the Events section lists the events of the last 24 hours without scrolling past the table; the airport and event type filters narrow the list and the line "Showing N of M events" matches; "View all events" opens Events; an unknown hash opens Overview; the banners stay visible on every section; the side menu becomes a tab bar at 640 px and narrower.
  - Pass criteria: no sideways page scroll; no word broken mid-word in headings, table headers, buttons or pills; "Not watching" and "Add" stay on one line; rows stack; every button and link is easy to tap; the menu becomes a tab bar; signed-out Settings shows Display and the sign-in state; VoiceOver still announces the airport tables as tables (D6). If VoiceOver loses table semantics, the agent adds the `role` attributes of Requirement 9.6 to the table elements as a follow-up change under `apps/web`, then the owner repeats this check.
  - Report failures to the agent, with page, width and theme, so that the fix goes into the matching task. When all checks pass, the owner ships to `main` (D9), unflagged, before December 4, 2026, 2:00 PM PT. The agent does not push, tag or merge.
  - _Requirements: 12.4, 16.7, 23.9_

## Notes

- Tasks 11 to 14 were added on 2026-11-24 for the Status dashboard (Requirements 17 to 23). Task 10 keeps its ID and its in-progress mark and now runs last, after tasks 11 to 14, so the owner reviews everything at once. Tasks 0 to 9 are unchanged.
- No test sub-task is marked optional, because the owner asked for tests with each change. Property tests (1.2, 8.1, 11.2) cover pure logic and contrast only. CSS and layout are example tests plus the manual check, because jsdom cannot compute layout and no browser automation tool is in the approved stack.
- Rollback (D9): the refresh has no feature flag. `git revert` of the refresh commit range restores the previous look. The refresh is MVP polish approved by the owner, not a Phase 2 item.
- The 20-airport cap, the 10-airport watchlist cap and 24-hour history stay as they are.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["0.1", "0.2"] },
    { "id": 1, "tasks": ["1.1"] },
    { "id": 2, "tasks": ["1.2", "1.3", "2.1", "2.2"] },
    { "id": 3, "tasks": ["2.3"] },
    { "id": 4, "tasks": ["2.4"] },
    { "id": 5, "tasks": ["2.5", "2.6"] },
    { "id": 6, "tasks": ["3"] },
    { "id": 7, "tasks": ["4.1"] },
    { "id": 8, "tasks": ["5.1"] },
    { "id": 9, "tasks": ["6.1"] },
    { "id": 10, "tasks": ["6.2", "7.1"] },
    { "id": 11, "tasks": ["7.2"] },
    { "id": 12, "tasks": ["7.3"] },
    { "id": 13, "tasks": ["8.1", "8.2", "8.3"] },
    { "id": 14, "tasks": ["9"] },
    { "id": 15, "tasks": ["11.1"] },
    { "id": 16, "tasks": ["11.2", "11.3", "12.1"] },
    { "id": 17, "tasks": ["12.2"] },
    { "id": 18, "tasks": ["12.3", "12.4"] },
    { "id": 19, "tasks": ["13.1"] },
    { "id": 20, "tasks": ["13.2"] },
    { "id": 21, "tasks": ["14"] },
    { "id": 22, "tasks": ["10"] }
  ]
}
```
