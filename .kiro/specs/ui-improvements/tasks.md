# Implementation Plan: AeroBrief UI Improvements

## Overview

Build the **Build now** criteria of `requirements.md` on branch `phase-2`. All code is TypeScript (strict). Order: pure logic for Requirements 1, 2, 3 and the accessibility baseline first, then Requirements 4, 7, 9, 8, 11, 12, 13, 14, 15, then the owner's Preview review, then the ship task.

**Guardrails for every task.**

- Never read or print `.env`, `.env.backup` or any `.dev.vars` file.
- Do not commit, push, tag or deploy. The owner fast-forwards and pushes `main`.
- Do not edit `.kiro/specs/aerobrief/`, `.kiro/specs/aerobrief-phase2/`, `.kiro/specs/ui-refresh/` or `.kiro/specs/core30-limits/`.
- Add no runtime dependency. No date library: use `Intl`. Icons stay inline SVG or CSS `mask-image` on `aria-hidden` spans; nothing inside the Status_View may be an `<svg>` or `<img>`.
- Restyle with CSS and class names. The `AirportTable` and `WatchlistTable` DOM stays unchanged. The nav bar DOM MAY change for Requirement 13; update `test/components/nav-bar.test.tsx` and `test/a11y/nav-bar.test.tsx` in the same task.
- Never lower a contrast threshold. Fix the token and add the pair to `palettePairs`.
- `packages/core` takes no `Date.now()` and reads no environment variable; `now` is always a parameter.
- A task marked **needs user action** cannot be done by the agent. Stop and tell the owner the exact step.

## Tasks

- [x] 1. Status derivation and network summary (Core)
  - [x] 1.1 Implement `packages/core/src/status-derivation.ts`
    - `AirportStatusKind`, `RECOVERY_PERIOD_MS`, `deriveAirportStatus`, `NetworkSummary`, `summarizeNetwork`, `normalizationEstimate`, as in `design.md`.
    - Export the icon/color/label catalog for all six kinds (`STATUS_CATALOG`), including `minor_impact` and `disrupted`, documented as not yet derived.
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 1.8_

  - [ ]* 1.2 Write property tests for status derivation
    - Create `packages/core/test/status-derivation.pbt.test.ts`, fast-check, `numRuns` >= 100, tags `// Feature: ui-improvements, Property N: ...`.
    - **Property 1: Status derivation returns exactly one of the four live statuses**
    - **Property 2: Recovery window boundary**
    - **Property 3: Network summary counts and affected list are consistent**
    - **Property 4: Normalization estimate is a non-empty, ordered range**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.6**

  - [ ]* 1.3 Write unit tests for status derivation
    - Create `packages/core/test/status-derivation.test.ts`: `minor_impact`/`disrupted` never appear in `deriveAirportStatus` output; `STATUS_CATALOG` has an icon, color and label for all six kinds; `summarizeNetwork` on all-normal input has `allNormal: true`.
    - _Requirements: 1.5, 1.8_

- [x] 2. Incident merging and structured explanations (Core)
  - [x] 2.1 Implement `packages/core/src/incidents.ts`
    - `Incident`, `mergeIncidents`, `sortIncidents`, as in `design.md`.
    - _Requirements: 2.1, 2.5_

  - [ ]* 2.2 Write property tests for incidents
    - Create `packages/core/test/incidents.pbt.test.ts`.
    - **Property 5: Incident merging drops no event and pairs correctly**
    - **Property 6: Incident sorting is active-first, then most-recent-end-first**
    - **Validates: Requirements 2.1, 2.5**

  - [x] 2.3 Add `explainStructured` to `packages/core/src/explain.ts`
    - Returns the five labeled fields (What's happening, Why, Likely impact, Next update, Source) with the fallback strings "Reason not published by the FAA", "Not yet announced" and "Not available", as in `design.md`.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7_

  - [ ]* 2.4 Write property test for structured explanations
    - Create `packages/core/test/explain-structured.pbt.test.ts`.
    - **Property 7: Structured explanation never has an empty field**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.7**

  - [ ]* 2.5 Write unit tests for incidents and structured explanations
    - Cover an unmatched GROUND_STOP_ENDED event (no matching start), the `UnsupportedEventTypeError` path of `explainStructured`, and the labeled-estimate text with its basis string.
    - _Requirements: 2.1, 3.4_

- [x] 3. API: add `incidentKey` to event responses
  - [x] 3.1 Add `incidentKey` to `StatusEventRow`, `EventSummary` and `toEventSummary` in `apps/api/src/handlers/status.ts`
    - Read `eventKey` off the stored row and expose it as `incidentKey` on `EventSummary`. Update `StatusDeps`/`StatusEventRow` and the repository call site in `apps/api/src/routes.ts` so the already-selected `eventKey` column reaches the handler.
    - Mirror the field in `apps/web/src/api/client.ts` (`EventSummary`, `isEventSummary`).
    - _Requirements: 2.1_

  - [ ]* 3.2 Update existing API and web tests for the new field
    - Update `apps/api/test/status.test.ts`, `history-clamp.pbt.test.ts`, `nationwide-status.pbt.test.ts`, `apps/web/test/components/fixtures.ts` and any fixture that builds an `EventSummary` by hand to include `incidentKey`.
    - _Requirements: 2.1_

- [x] 4. Checkpoint - Core and API pure logic
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Overview pane: network summary, chips, recovering detail
  - [x] 5.1 Wire `summarizeNetwork` into the Overview pane of `StatusView.tsx`
    - Replace the ad hoc ground-stop/ARTCC counts with the all-normal headline, the "outdated" marker while stale, the "Data Unavailable" fallback with no status data, the two summary chips (ground stops, recovering) via `MetricChip`, and a recovering detail line (time since end, `normalizationEstimateMinutes` labeled "AeroBrief estimate").
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 5.2 Add the six-kind `StatusPill`/icon mapping
    - Extend `StatusPill` (or add a sibling) so every `AirportStatusKind` has a distinct icon, color and text label (Requirement 1.8); add the new color tokens to `palette.ts`/`tokens.css`/`themes.ts` and their pairs to `palettePairs`.
    - _Requirements: 1.8, 17.1, 17.2_

  - [ ]* 5.3 Write unit tests for the Overview pane
    - Cover the all-normal headline, the "No events in the last 24 hours" fallback, the stale marker, and the recovering detail line text.
    - _Requirements: 1.4, 1.5, 1.6_

- [x] 6. Incident cards in the Events pane
  - [x] 6.1 Create `apps/web/src/components/StructuredExplanation.tsx`
    - Renders the five labeled fields from `explainStructured`.
    - _Requirements: 3.1, 3.2, 3.3, 3.7_

  - [x] 6.2 Create `apps/web/src/components/IncidentCard.tsx`
    - Merges events via `mergeIncidents`/`sortIncidents` (passed in by the parent), renders active/resolved style, the expand/collapse timeline, the FAA NAS Status site link, the airport page link, and `StructuredExplanation`. Falls back to the existing `EventCard` for any event type `mergeIncidents` does not recognize.
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 6.3 Wire `IncidentCard` into the Events pane and the Overview "Latest events" list in `StatusView.tsx`
    - _Requirements: 2.1, 2.5_

  - [ ]* 6.4 Write unit tests for `IncidentCard` and `StructuredExplanation`
    - Expand/collapse, FAA link href, active vs. resolved icon+text, all five fields rendered with fallbacks.
    - _Requirements: 2.2, 2.3, 2.4, 2.6, 2.7, 3.1_

- [x] 7. Checkpoint - Overview and Events panes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Time display
  - [x] 8.1 Implement `apps/web/src/lib/time-text.ts`
    - `RELATIVE_THRESHOLD_MS`, `formatTimeText`, `formatTooltip`, `resolveDisplayMode`, as in `design.md`.
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 8.2 Write property tests for time display
    - **Property 10: Relative/absolute threshold**
    - **Property 11: Tooltip always shows all three zones**
    - **Property 12: Display mode resolution**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

  - [x] 8.3 Implement `packages/core/src/airport-time-zones.ts`
    - `AIRPORT_TIME_ZONES`, `airportTimeZone`, as in `design.md`.
    - _Requirements: 7.2_

  - [ ]* 8.4 Write unit test for the airport time zone table
    - Every `MonitoredId` has an entry; every value is accepted by `Intl.DateTimeFormat`.
    - _Requirements: 7.2_

  - [x] 8.5 Create `apps/web/src/components/TimeText.tsx`
    - Renders `<time dateTime>` with a keyboard-reachable tooltip; refreshes relative text at least once a minute via a shared interval.
    - _Requirements: 7.5, 7.6_

  - [ ]* 8.6 Write property test and unit test for `TimeText`
    - **Property 13: Time element datetime is preserved**
    - **Validates: Requirements 7.6**
    - Unit test with fake timers: the rendered text updates after 60 s without a re-render trigger from the parent.
    - _Requirements: 7.5_

  - [x] 8.7 Add the Display_Setting control to the Settings Display section and replace `formatUtc` call sites
    - Add the Relative/Airport local/My local/UTC choice to `DisplaySettings.tsx`, store it in `localStorage`. Replace `formatUtc(...)` in `EventCard`, `SummaryCard`, `AirportPage`, `GroundStopDetails` and the Overview/Events panes with `<TimeText>`.
    - _Requirements: 7.3, 7.4_

- [x] 9. Checkpoint - time display
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Freshness indicator
  - [x] 10.1 Implement `apps/web/src/lib/freshness.ts`
    - `Freshness`, `deriveFreshness`, `freshnessChanged`, as in `design.md`.
    - _Requirements: 9.1, 9.4, 9.5_

  - [ ]* 10.2 Write property tests for freshness
    - **Property 14: Freshness derivation is total and deterministic**
    - **Property 15: Freshness announcement fires only on change**
    - **Validates: Requirements 9.1, 9.4, 9.5**

  - [x] 10.3 Create `apps/web/src/components/FreshnessChip.tsx` and wire it into `StatusPage.tsx`
    - Live/Delayed/Unavailable text, `TimeText`-based exact-timestamp tooltip, a polite live region gated by `freshnessChanged`, loading skeletons on the first request. Remove the repeated "Data as of" lines the chip now covers.
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 10.4 Keep last known data and show Unavailable only when nothing ever loaded
    - Confirm `useStatus`'s existing `refreshFailed`/last-data behavior feeds `deriveFreshness` correctly; adjust if the hook needs the "ever loaded" flag explicitly.
    - _Requirements: 9.5_

  - [ ]* 10.5 Write unit tests for `FreshnessChip` and the loading skeleton
    - _Requirements: 9.2, 9.3, 9.4_

- [x] 11. Checkpoint - freshness
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Plain-language labels
  - [x] 12.1 Add the ARTCC definition and rename labels
    - Add a reachable (keyboard and screen reader) definition of Air Route Traffic Control Center next to "Regions affected" (renamed from "Affected ARTCCs") in `SummaryCard.tsx`. Rename the Status page title to "Airport status" in `StatusPage.tsx` and update its subtitle to state what AeroBrief tracks now without referring only to ground stops.
    - _Requirements: 8.1, 8.3, 8.5_

  - [ ]* 12.2 Update existing tests for the renamed labels
    - Update `test/components/summary-card.test.tsx`, `test/components/status-page.test.tsx`, `test/components/auth-pages.test.tsx` and any other test asserting the old "National status"/"Affected ARTCCs" text.
    - _Requirements: 8.1, 8.3, 8.5_

- [x] 13. Filters, search and URL query state
  - [x] 13.1 Implement `apps/web/src/lib/dashboard-query.ts`
    - `encodeDashboardQuery`, `decodeDashboardQuery`, as in `design.md`.
    - _Requirements: 11.7_

  - [ ]* 13.2 Write property test for dashboard query round trip
    - **Property 18: Dashboard query round-trips**
    - **Validates: Requirements 11.7**

  - [x] 13.3 Add city to the airport registry and extend the search predicate
    - Add a `city` field to `packages/core/src/airports.ts` for the 30 Core 30 airports. Extend `apps/web/src/lib/airport-search.ts` (`matchesAirportSearch`) to match the city.
    - _Requirements: 11.2_

  - [ ]* 13.4 Write property test for airport search
    - **Property 17: Airport search matches code, name or city case-insensitively**
    - **Validates: Requirements 11.2**

  - [x] 13.5 Update the Airports pane filter and search UI in `StatusView.tsx`
    - "All (N)" / "Affected (N)" counts with a selected state that differs by more than color; the new placeholder, search icon and clear button; a polite "Showing X of Y" announcement on every filter or search change; an empty state with a "Clear filters" button; persist filter/search state via `dashboard-query.ts` in the URL query string, leaving the `#section` hash untouched.
    - _Requirements: 11.1, 11.2, 11.5, 11.6, 11.7_

  - [x] 13.6 Extend the Events pane filters to use `dashboard-query.ts` and add the "state" filter
    - Add an active/ended filter alongside the existing airport/type filters in `EventFilters.tsx`; wire all three into the URL query string; add the same "Showing X of Y" announcement and "Clear filters" empty state.
    - _Requirements: 11.4, 11.5, 11.6, 11.7_

  - [ ]* 13.7 Write unit tests for the extended filters
    - Count correctness, announcement text, empty-state "Clear filters" behavior, URL round trip through the rendered page.
    - _Requirements: 11.1, 11.4, 11.5, 11.6_

- [x] 14. Checkpoint - filters and search
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Signed-out watchlist
  - [x] 15.1 Implement `apps/web/src/lib/local-watchlist.ts`
    - `readLocalWatchlist`, `writeLocalWatchlist`, `mergeIntoAccount`, `sortBySeverity`, as in `design.md`.
    - _Requirements: 4.1, 4.3, 4.5_

  - [ ]* 15.2 Write property tests for the local watchlist
    - **Property 8: Local watchlist merge respects the cap and reports overflow**
    - **Property 9: Severity sort is a total order consistent with status**
    - **Validates: Requirements 4.3, 4.5**

  - [x] 15.3 Add the signed-out branch to `WatchlistPage.tsx`
    - Quick-add chips for ATL, DFW and LAS, airport search, the Local_Watchlist-backed status list sorted by severity with a one-line explanation, a non-blocking note that the daily digest and alerts need an account, and no error banner while signed out.
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.6_

  - [x] 15.4 Add the sign-in merge offer
    - On sign-in with a non-empty Local_Watchlist, offer to add the saved airports to the account (respecting the cap of 30) and report how many could not be added.
    - _Requirements: 4.3_

  - [ ]* 15.5 Write unit tests for the signed-out Watchlist page
    - Quick-add chips present and functional, search present, no error banner, the account note text, the merge-offer banner and its overflow message.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6_

- [x] 16. Checkpoint - signed-out watchlist
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Settings structure
  - [x] 17.1 Reorder `SECTION_IDS` and add the Save/Saved/Retry and lock-indicator UI
    - Change `SECTION_IDS` in `settings-sections.ts` to `["digest", "webhooks", "display", "account"]`. Add Saved confirmation text (or an error with a Retry button) to `DigestSettings.tsx` and `WebhookSettings.tsx` where missing. Add a lock icon and sign-in prompt to the signed-out state of `SettingsPage.tsx`'s `SessionGate`, replacing the plain text.
    - _Requirements: 12.1, 12.5, 12.6_

  - [x] 17.2 Convert the theme control to a segmented control with live preview
    - In `DisplaySettings.tsx`, replace the radio-button theme control with a segmented control (keeping the same `localStorage` keys and change event) and add a small live preview swatch that updates immediately on selection.
    - _Requirements: 12.3_

  - [ ]* 17.3 Write unit tests for the reordered Settings page
    - Section order, Save/Saved/Retry states, lock indicator text and link, segmented control selection and preview update, existing `aria-describedby` wiring for the High contrast hint.
    - _Requirements: 12.1, 12.3, 12.4, 12.5, 12.6_

- [x] 18. Checkpoint - Settings
  - Ensure all tests pass, ask the user if questions arise.

- [x] 19. Navigation and responsiveness
  - [x] 19.1 Split the Sign-in control and add the account menu in `NavBar.tsx`
    - Render "Sign in" as a `Button`-styled link, visually separate from the plain nav links, while signed out. Add `AccountMenu.tsx` (new) rendered in place of `SignOutButton` while signed in. Keep one active-indicator style shared with `SectionMenu`'s `aria-current` styling.
    - _Requirements: 13.1, 13.2_

  - [x] 19.2 Add the narrow-viewport collapse to `NavBar.tsx` and a horizontal tab bar to `SectionMenu.tsx`
    - A `<button aria-expanded>` toggles a `hidden` `<ul>` under 768px; `SectionMenu` becomes a horizontal, scrollable tab bar at the same breakpoint. Ensure every control (nav links, account menu, section menu links, filter buttons added in task 13) meets the 44px Touch_Target.
    - _Requirements: 13.3, 13.4_

  - [x] 19.3 Verify 320px usability
    - Add/adjust CSS so no page introduces horizontal scrolling at 320px, reusing the layout fix already in place from `ui-refresh`.
    - _Requirements: 13.5_

  - [ ]* 19.4 Update and write nav/responsiveness tests
    - Update `test/components/nav-bar.test.tsx` and `test/a11y/nav-bar.test.tsx` for the new markup (Sign-in button, account menu, collapse toggle). Add tests for the Touch_Target sizes and the 320px layout (reusing the pattern in `test/layout-css.test.ts`).
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [x] 20. Checkpoint - navigation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 21. Footer and layout consistency
  - [x] 21.1 Update `Footer.tsx`
    - Add the API documentation link, the advisory notice "Information is advisory and not for operational flight decisions.", and restyle the license/attribution line as a secondary (smaller, muted) line below the primary links. Keep the existing data-source and license links.
    - _Requirements: 14.1, 14.2, 14.3_

  - [x] 21.2 Add footer spacing, underline/focus and sticky-bottom CSS
    - Use the shared spacing scale; visible underlines and a focus indicator on footer links; keep the footer at the bottom of the viewport on pages shorter than the viewport.
    - _Requirements: 14.4_

  - [x] 21.3 Verify shared container width and left-edge alignment
    - Confirm the page title, page content and footer text share one left edge and one maximum-width container across all edited pages; adjust CSS where a new element (FreshnessChip, IncidentCard, segmented control) does not yet follow the spacing scale.
    - _Requirements: 15.1, 15.2, 15.3_

  - [ ]* 21.4 Write/update unit tests for the footer and layout
    - Update `test/components/footer.test.tsx` for the new link and notice text. Extend `test/layout-css.test.ts` for the new components' spacing-scale usage.
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 15.1, 15.2, 15.3_

- [x] 22. Checkpoint - footer and layout
  - Ensure all tests pass, ask the user if questions arise.

- [x] 23. Accessibility pass
  - [x] 23.1 Add every new color pair to `palettePairs` and recompute the Flags_Guard hash
    - Add pairs for the Airport_Status colors (minor_impact, disrupted, ground_stop, recovering, data_unavailable if new tokens were introduced beyond task 5.2), the FreshnessChip states, and the IncidentCard active/resolved accents. Update `tests/flags-off-guard.test.ts`'s pinned SHA-256 hashes for `tokens.css` and `palette.ts`.
    - _Requirements: 17.1, 17.2_

  - [x] 23.2 Audit color-only signaling across new UI
    - Confirm every status, filter-selected state and freshness state is conveyed by text as well as color (Overview chips, Airports filter buttons, Events state filter, FreshnessChip, IncidentCard active/resolved).
    - _Requirements: 17.2_

  - [x] 23.3 Audit keyboard operability and focus indicators
    - Confirm every new control (TimeText tooltip, IncidentCard disclosure, segmented control, account menu, nav collapse toggle, quick-add chips, Clear filters button) is reachable and operable by keyboard with a focus indicator at least 2px wide.
    - _Requirements: 17.3_

  - [x] 23.4 Audit live regions
    - Confirm every change announcement (Freshness, "Showing X of Y", Settings Saved/error) uses a polite live region, never assertive.
    - _Requirements: 17.4_

  - [x] 23.5 Extend the axe all-variants matrix
    - Add cases to `apps/web/test/a11y/themes/all-variants.test.tsx` for: the Overview pane with recovering/ground-stop/data-unavailable states, the signed-out Watchlist page, each reordered Settings section, and the collapsed nav bar at a narrow viewport. Keep zero tolerated violations across all four Theme_Variants.
    - _Requirements: 17.6_

  - [ ]* 23.6 Write the remaining unit tests for 17.1-17.4
    - Any accessibility assertion not already covered by component tests in earlier tasks.
    - _Requirements: 17.1, 17.2, 17.3, 17.4_

- [-] 24. Checkpoint - accessibility pass, full suite green
  - Ensure all tests pass, ask the user if questions arise.

- [~] 25. Owner review on a Vercel Preview of `phase-2` (**needs user action**)
  - The owner pushes `phase-2`. A Preview is built only when the push changes files under `apps/web`; this work does, so the push builds one. The owner reviews the signed-out views only (sign-in works only on `www`): the Overview/Events/Airports panes in each status, the signed-out Watchlist page, the Settings page's Display section, the collapsed nav bar on a phone-width viewport, and the footer. Changes the owner asks for become new tasks appended here before the ship task.
  - _Requirements: (owner acceptance of all Build now criteria)_

- [~] 26. Ship (**needs user action**)
  - The owner fast-forwards `main` from `phase-2` and pushes, before December 4, 2026, 2:00 PM PT. The push deploys the API Worker, the Poller Worker (no change in this spec, but part of the same deploy) and the web app. `main` is frozen after the deadline until judging has finished.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP; the agent does not implement `*` sub-tasks.
- Every task references the specific Build now criteria it satisfies, from `requirements.md`.
- Checkpoints ensure incremental validation; ask the user before moving past a checkpoint if anything is unclear.
- Property tests validate the 18 Correctness Properties in `design.md`; unit tests validate specific examples, fixed copy and edge cases.
- No database migration is included. The one additive API field (`incidentKey`) requires no schema change, because `events.eventKey` already exists.
- Tasks 25 and 26 are **needs user action** and cannot be completed by the agent.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "8.3"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2", "2.3", "8.4"] },
    { "id": 2, "tasks": ["2.4", "2.5"] },
    { "id": 3, "tasks": ["3.1"] },
    { "id": 4, "tasks": ["3.2"] },
    { "id": 5, "tasks": ["4"] },
    { "id": 6, "tasks": ["5.1", "5.2", "8.1", "10.1", "13.1", "13.3", "15.1"] },
    { "id": 7, "tasks": ["5.3", "8.2", "8.5", "10.2", "13.2", "13.4", "15.2"] },
    { "id": 8, "tasks": ["6.1", "8.6", "10.3"] },
    { "id": 9, "tasks": ["6.2"] },
    { "id": 10, "tasks": ["6.3", "8.7", "10.4"] },
    { "id": 11, "tasks": ["6.4", "10.5"] },
    { "id": 12, "tasks": ["7"] },
    { "id": 13, "tasks": ["9"] },
    { "id": 14, "tasks": ["11"] },
    { "id": 15, "tasks": ["12.1"] },
    { "id": 16, "tasks": ["12.2", "13.5"] },
    { "id": 17, "tasks": ["13.6"] },
    { "id": 18, "tasks": ["13.7"] },
    { "id": 19, "tasks": ["14"] },
    { "id": 20, "tasks": ["15.3"] },
    { "id": 21, "tasks": ["15.4"] },
    { "id": 22, "tasks": ["15.5"] },
    { "id": 23, "tasks": ["16"] },
    { "id": 24, "tasks": ["17.1", "17.2"] },
    { "id": 25, "tasks": ["17.3"] },
    { "id": 26, "tasks": ["18"] },
    { "id": 27, "tasks": ["19.1"] },
    { "id": 28, "tasks": ["19.2"] },
    { "id": 29, "tasks": ["19.3"] },
    { "id": 30, "tasks": ["19.4"] },
    { "id": 31, "tasks": ["20"] },
    { "id": 32, "tasks": ["21.1"] },
    { "id": 33, "tasks": ["21.2", "21.3"] },
    { "id": 34, "tasks": ["21.4"] },
    { "id": 35, "tasks": ["22"] },
    { "id": 36, "tasks": ["23.1"] },
    { "id": 37, "tasks": ["23.2", "23.3", "23.4"] },
    { "id": 38, "tasks": ["23.5"] },
    { "id": 39, "tasks": ["23.6"] },
    { "id": 40, "tasks": ["24"] },
    { "id": 41, "tasks": ["25"] },
    { "id": 42, "tasks": ["26"] }
  ]
}
```
