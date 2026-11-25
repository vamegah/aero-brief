# Implementation Plan: AeroBrief UI Review Fixes

## Overview

Build the 11 owner-approved fixes from the 2026-11-25 screenshot review on top of `.kiro/specs/ui-improvements/`. All code is TypeScript (strict), in `apps/web` only. Order: the highest-severity fix (Requirement 1, the stale "active" incident) first, then the remaining ten in the order they appear in `requirements.md`, then one owner Preview/phone review task, then one ship task.

**Guardrails for every task.**

- Never read or print `.env`, `.env.backup`, or any `.dev.vars` file.
- Do not commit, push, tag, or deploy. The owner performs the ship step manually before the Deadline (December 4, 2026, 2:00 PM PT).
- Add no runtime dependency. Icons stay inline SVG (`aria-hidden`) or the existing CSS `mask-image` span pattern; nothing inside the Status_View renders `<svg>`/`<img>`.
- Restyle with CSS and class names. The airport table, banners, and `aria-live` region DOM stay unchanged except for `Status_Cell` text content (Requirement 8). The nav bar DOM MAY change for Requirement 4; update `test/components/nav-bar.test.tsx` and `test/a11y/nav-bar.test.tsx` in the same task.
- Never lower a contrast threshold. Fix the token and add any new pair to `palettePairs`.
- Tasks 1 to 17 do not modify `packages/core` (Requirement 2 is investigation-only; its finding is already recorded in `design.md`). The second round does: Task 19 changes `status-derivation.ts` and Task 20 adds `format-duration.ts` and changes `explain.ts`, each with its mirrored tests in `packages/core/test/` in the same task, because `.kiro/steering/structure.md` requires it and the test-update hook checks it.
- Second-round tasks 18 to 25 also edit `.kiro/hooks/require-test-update.json`, `docs/decisions.md`, `docs/hooks.md` and `docs/kiro-usage.md` (Tasks 19.4, 24.1, 24.2). Nothing is committed.

## Tasks

- [x] 1. Incident feed: snapshot-aware activity and cross-key pairing
  - [x] 1.1 Implement `activeGroundStopIds` and `reconcileWithSnapshot` in `apps/web/src/lib/incident-feed.ts`
    - Add `ActiveGroundStopMap`, `activeGroundStopIds`, and `reconcileWithSnapshot` as in `design.md`.
    - Extend `IncidentFeed` with an optional `endTimeNotRecorded?: ReadonlySet<string>`.
    - Extend `buildIncidentFeed`'s signature with an optional `snapshotAirports` parameter; call `reconcileWithSnapshot` after the existing `mergeIncidents`/`sortIncidents` call when `snapshotAirports` is provided, otherwise skip it (Requirement 1.5).
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]* 1.2 Write property tests for `reconcileWithSnapshot`
    - Create `apps/web/test/incident-feed-reconcile.pbt.test.ts`, fast-check, `numRuns` >= 100, tags `// Feature: ui-review-fixes, Property N: ...`.
    - **Property 1: Activity reflects the snapshot**
    - **Property 2: Cross-key pairing matches nearest-earlier-start**
    - **Property 3: Unpaired, inactive starts are marked unresolved**
    - **Property 4: No snapshot means no reclassification**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.5**

  - [ ]* 1.3 Write unit tests for `reconcileWithSnapshot` and `buildIncidentFeed`
    - Create or extend `apps/web/test/incident-feed.test.ts` with the exact production scenario from the review (ORD start/end with different FAA ids, airport not active in the current snapshot) and assert the merged incident is ended with a computed duration from the paired times.
    - Add one case where an unmatched start has no pairing end and the airport is inactive: assert `endTimeNotRecorded` contains its key.
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 1.4 Wire the snapshot into `StatusView.tsx` and thread `endTimeNotRecorded` to `IncidentCard`
    - Pass `ok?.airports` into `buildIncidentFeed` (omit the argument when `ok === null`).
    - Thread `feed.endTimeNotRecorded` through `IncidentList` to `IncidentCard` the same way `recovery`/`activeStops` are threaded today, keyed by `incidentKey`.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Incident card header and ended-state text
  - [x] 2.1 Add the state pill and header spacing to `IncidentCard.tsx`
    - Wrap the existing `stateLabel` span in pill-styled markup (`incident-card__state-pill`), visually separated from `incident-card__type` and the airport code/name via spacing tokens in CSS (no new component; CSS and class names only).
    - _Requirements: 7.1_

  - [x] 2.2 Implement the ended-state duration text branches in `IncidentCard.tsx`
    - When ended with a known start and not flagged `endTimeNotRecorded`: render "Ended `<TimeText>` · lasted `<duration>`".
    - When `unknownStart` or flagged `endTimeNotRecorded`: render "Started more than 24 hours ago".
    - _Requirements: 7.2, 7.3_

  - [ ]* 2.3 Write unit tests for `IncidentCard` header and duration text
    - Extend `apps/web/test/components/incident-card.test.tsx` with cases for: the state pill's separation classes on an active and an ended card; an ended card with a known start/end and a representative duration (reuse existing `formatDuration` fixtures, no new PBT since `ground-stop-durations.pbt.test.ts` already covers that function); an ended card with `unknownStart`; an ended card flagged `endTimeNotRecorded`.
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 2.4 Add CSS for `incident-card__state-pill` spacing
    - Add spacing-token rules to `apps/web/src/styles/surfaces.css` (or the incident card's existing stylesheet) for the new pill class; add any new color pair to `palettePairs` if one is introduced (reusing `.status-pill` colors should avoid this).
    - _Requirements: 7.1, 7.4_

- [x] 3. Checkpoint - Incident feed and card
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Airport table status cell text
  - [x] 4.1 Add `recoveringIds` to `AirportTable.tsx` and change the normal-state text
    - Add an optional `recoveringIds?: ReadonlySet<string>` prop (default empty `Set`).
    - Change the `groundStop === null` branch to render `AirportStatusPill kind="recovering"` when the airport id is in `recoveringIds`, else `StatusPill variant="normal" text="Operating normally"`.
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 4.2 Pass `recoveringIds` from `StatusView.tsx`
    - Derive `recoveringIds` from `overview.affected.filter(a => a.kind === "recovering")` and pass it to `AirportTable`.
    - _Requirements: 8.2_

  - [ ]* 4.3 Update existing `AirportTable` tests for the new text and the recovering case
    - Update `apps/web/test/components/airport-table-details.test.tsx`'s assertion of "No ground stop reported" to "Operating normally".
    - Add a case asserting the "Recovering" pill renders when the airport id is in `recoveringIds`.
    - _Requirements: 8.1, 8.2, 8.4_

- [x] 5. Navigation: Settings link, chevron icon, aria-current
  - [x] 5.1 Always render the Settings link in `NavBar.tsx`
    - Remove the `session === "signed-in" ? LINKS.filter(...) : LINKS` filter so `LINKS` (including `/settings`) always renders.
    - _Requirements: 4.1, 4.3_

  - [x] 5.2 Add the down-arrow icon and control styling to `AccountMenu.tsx`
    - Add an inline SVG chevron after "Account", `aria-hidden="true"`.
    - Add a bordered/filled control treatment to `.account-menu__button` in CSS, matching the nav bar's existing control weight; add any new color pair to `palettePairs`.
    - _Requirements: 4.2_

  - [ ]* 5.3 Update nav bar tests for the Settings link, icon, and aria-current
    - Update `apps/web/test/components/nav-bar.test.tsx` and `apps/web/test/a11y/nav-bar.test.tsx` to assert: "Settings" renders as a top-level link when signed in; the Account button contains an `aria-hidden` SVG; `aria-current="page"` is set on the Settings link when `pathname === "/settings"`.
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 6. Checkpoint - Airport table and navigation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Search field width and placeholder text
  - [x] 7.1 Widen the Airports and Watchlist search fields and update their placeholder
    - Add a `min-width: 24rem` rule (at >=768px) and a full-width rule (<768px) to the `.airport-search` CSS used by both `StatusView.tsx`'s Airports pane and `SignedOutWatchlist.tsx`'s search section.
    - Change both fields' placeholder text to "Code or city, e.g. LAS or Las Vegas".
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ]* 7.2 Write a CSS assertion test for the search field width
    - Extend `apps/web/test/layout-css.test.ts` (or an equivalent CSS-parsing test) to assert the `min-width: 24rem` rule and the narrow-viewport full-width rule exist for `.airport-search`.
    - _Requirements: 3.1, 3.2_

  - [ ]* 7.3 Update tests that assert the old placeholder text
    - Update any test asserting the previous placeholder string to the new one, on both the Airports pane and the Watchlist search.
    - _Requirements: 3.3_

- [x] 8. Webhook settings: time display, danger-outline delete, confirm dialog
  - [x] 8.1 Replace `formatTime` with `TimeText` in `WebhookSettings.tsx`
    - Change `outcomeText`'s rendering to use `TimeText` for `lastOutcomeAt` instead of the raw "YYYY-MM-DD HH:mm UTC" string; remove `formatTime` once unused.
    - _Requirements: 5.1, 5.2_

  - [x] 8.2 Change the Delete button to `danger-outline` and add a confirm dialog
    - Change the per-item Delete button's `variant` to `"danger-outline"`.
    - Add `pendingDelete` state and a `ConfirmDialog` naming the webhook's host; confirm calls the existing delete flow, cancel clears the pending state without calling `deleteWebhook`.
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 8.3 Write unit tests for the webhook time display and delete confirmation
    - Update `apps/web/test/webhook-settings.test.tsx`: assert a `<time>` element renders for the delivery time instead of the raw UTC string; assert the Delete button has the danger-outline class; assert clicking Delete opens a confirmation naming the host; assert confirming calls `deleteWebhook` and cancelling does not.
    - _Requirements: 5.1, 6.1, 6.2, 6.3, 6.4_

- [x] 9. Checkpoint - Search fields and webhook settings
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Signed-out Watchlist spacing and grouping
  - [x] 10.1 Add spacing classes to `SignedOutWatchlist.tsx` and its CSS
    - Group the value statement and "Sign in" button as one visual block, separated from the account note by a spacing token.
    - Add a spacing token between "Quick add", "Search airports", and "Your airports" sections.
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ]* 10.2 Write a structural/CSS test for the new grouping
    - Extend `apps/web/test/components/watchlist-signed-out.test.tsx` to assert the existing DOM elements remain present and the new grouping class names exist.
    - _Requirements: 9.4_

- [x] 11. Display settings: contrast hint spacing and theme preview swatches
  - [x] 11.1 Tighten the high-contrast hint spacing in `display-settings.css`
    - Add a more specific `.display-settings__contrast .display-settings__hint` rule with reduced `margin-top`; keep the existing `aria-describedby` relationship unchanged.
    - _Requirements: 10.1_

  - [x] 11.2 Replace the single swatch with three labeled swatches in `DisplaySettings.tsx`
    - Render System/Light/Dark swatches using the existing default and `dark` theme token values and `window.matchMedia` for the System swatch's resolved color; keep each swatch's text label visible and the `data-testid="theme-preview"` wrapper.
    - _Requirements: 10.2, 10.3_

  - [ ]* 11.3 Update the display settings test for the new preview
    - Update `apps/web/test/display-settings.test.tsx`'s preview assertions to check for the three swatch labels instead of the single combined sentence.
    - _Requirements: 10.3_

- [x] 12. Checkpoint - Watchlist spacing and display settings
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Digest local-time equivalent
  - [x] 13.1 Implement `apps/web/src/lib/digest-local-time.ts`
    - Add `localHourLabel` and `hourWithLocalEquivalent` as in `design.md`.
    - _Requirements: 11.1, 11.2_

  - [ ]* 13.2 Write a property test for `hourWithLocalEquivalent`
    - Create `apps/web/test/digest-local-time.pbt.test.ts`, fast-check, `numRuns` >= 100, tag `// Feature: ui-review-fixes, Property 5: Local hour conversion is a consistent rotation`.
    - **Property 5: Local hour conversion is a consistent rotation**
    - **Validates: Requirements 11.1**

  - [x] 13.3 Wire the local-time text into `DigestSettings.tsx`
    - Render `hourWithLocalEquivalent(hour, browserTimeZone(), new Date())` next to the "Send at (UTC)" select, recomputed on every `hour` state change.
    - _Requirements: 11.1, 11.2, 11.3_

  - [ ]* 13.4 Write a unit test for the digest hour text updating on selection
    - Extend `apps/web/test/digest-settings.test.tsx` to assert the local-time text changes when a different hour is selected, before Save is clicked.
    - _Requirements: 11.3_

- [x] 14. Lighter separators: webhook list items and footer
  - [x] 14.1 Change `.webhook-settings__item` and `.site-footer` borders to the table-rule token
    - Change `.webhook-settings__item`'s `border-top` from `--color-border` to `--color-table-rule`.
    - Change `.site-footer`'s `border-top` from its 2px `--color-border` rule to a lighter `--color-table-rule` treatment, keeping the border visible.
    - _Requirements: 12.1, 12.2, 12.3_

  - [ ]* 14.2 Write CSS assertion tests for the lighter separators
    - Extend `apps/web/test/layout-css.test.ts` (or equivalent) to assert both selectors reference `--color-table-rule`.
    - _Requirements: 12.1, 12.2_

- [x] 15. Checkpoint - Digest local time and lighter separators
  - Ensure all tests pass, ask the user if questions arise.

### Second round (2026-11-25, owner: "all")

Tasks 18 to 25 are listed here, ahead of Tasks 16 and 17, because they run first: Task 16 (owner review) and Task 17 (ship) keep their IDs and depend on Tasks 18 to 25. The tests in these tasks are required (no `*`) because the first round's optional tests left the Requirement 1 wiring defect unnoticed.

- [x] 18. Stale-active incident fix on the live response
  - [x] 18.1 Diagnose and fix why `reconcileWithSnapshot` is not applied to the live response
    - First write the failing test of Task 18.2 against the current code and confirm it fails.
    - `design.md` section 8 names the probable cause: `StatusView.tsx` line 95 calls `buildIncidentFeed(events)` with no snapshot airports. Change it to pass `ok?.airports` (no argument when `ok === null`).
    - Check that no other code path builds incidents from events for the Overview "Latest events" list or the Events pane (`latestEndedKeys`, `filterIncidentFeed`, `limitFeed`, `network-overview.ts`). If the fixture still fails after the wiring fix, work through the suspects (a), (b), (c) listed in `design.md` section 8, fix the one found, and record the final root cause in that section.
    - Edit `apps/web/src/components/StatusView.tsx` and, only if the diagnosis requires it, `apps/web/src/lib/incident-feed.ts`. Do not change the status marks of Tasks 1.1 to 1.4.
    - _Requirements: 18.4, 18.5, 1.1, 1.2, 1.4_

  - [x] 18.2 Write the Live_Fixture render test
    - Create `apps/web/test/status-view-live-fixture.test.tsx`. Load `apps/web/test/fixtures-live-national-2026-11-25.json`, render `StatusView` with a fixed `now` of 2026-11-25T21:00:00Z, and assert for the Overview "Latest events" list and the Events pane separately: one ended ORD incident that lasted 40 min, no ORD card containing "Active for", no ORD card containing "Started more than 24 hours ago".
    - _Requirements: 18.1, 18.2, 18.3, 18.6_

- [x] 19. Recovering window from the estimate upper bound
  - [x] 19.1 Change `packages/core/src/status-derivation.ts`
    - Add `RECOVERY_MIN_MS`, `RECOVERY_MAX_MS` and `recoveryWindowMs` as in `design.md` section 9; read the real signature of `deriveAirportStatus` first and add the ended-stop duration input (`null` when the start is unknown) with the smallest change that keeps existing callers compiling.
    - Replace the `RECOVERY_PERIOD_MS` comparison with `recoveryWindowMs`; grep for importers of `RECOVERY_PERIOD_MS` and keep it as an alias of `RECOVERY_MAX_MS` only if one remains.
    - _Requirements: 19.1, 19.2, 19.3, 19.4_

  - [x] 19.2 Update the core tests in the same task as Task 19.1
    - Update `packages/core/test/status-derivation.test.ts` (clamp at 1 h and 24 h, boundary exactly at the limit, unknown duration, the 40-minute stop that ended 90 minutes ago) and `packages/core/test/status-derivation.pbt.test.ts`; fix any existing assertion that assumed the fixed 24-hour period.
    - **Property 6: Recovery window is the clamped estimate upper bound**
    - **Property 7: Recovery window is monotone in stop duration and bounded**
    - **Validates: Requirements 19.1, 19.2, 19.3, 19.4, 19.6**

  - [x] 19.3 Route every web surface through the one derivation
    - Create the shared helper `apps/web/src/lib/airport-status-by-id.ts` that returns the `deriveAirportStatus` result per airport id from the snapshot airports and the merged incidents (including each airport's last ended time and duration).
    - Use it in `network-overview.ts` (headline and chips) and in `StatusView.tsx` for `recoveringIds` (Airports table); leave the Watchlist wiring to Task 23.1. Grep `apps/web/src` for `RECOVERY_PERIOD_MS`, `recovering` and `lastEndedAt` and remove any separate window computation.
    - Add a test in `apps/web/test/` asserting that the Overview, the Airports table pill and the helper agree for a stop that ended 30 minutes ago (Recovering) and one that ended 90 minutes ago (Normal), both 40-minute stops. Update existing web tests that assumed 24 hours.
    - _Requirements: 19.5_

  - [x] 19.4 Record the owner decision in `docs/decisions.md`
    - Append an entry dated 2026-11-25: the Recovery_Window now ends at the estimate upper bound, clamped to 1 to 24 hours; it supersedes Requirement 1.2 of `.kiro/specs/ui-improvements/requirements.md`; the owner approved it in the 2026-11-25 second-round review ("all"). Follow the heading style of the existing entries.
    - _Requirements: 19.7_

- [x] 20. Likely impact text uses the duration formatter
  - [x] 20.1 Share one duration formatter and change `explainStructured`
    - Create `packages/core/src/format-duration.ts` exporting `formatDurationText(ms)`; export it from `packages/core/src/index.ts`.
    - Change `apps/web/src/lib/ground-stop-durations.ts` so `formatDuration(ms)` returns `Lasted ` plus `formatDurationText(ms)` with identical output to today.
    - Change `estimateText` in `packages/core/src/explain.ts` as in `design.md` section 10.
    - _Requirements: 20.1, 20.2, 20.3_

  - [x] 20.2 Update and add core and web tests in the same task as Task 20.1
    - Create `packages/core/test/format-duration.test.ts` and `packages/core/test/format-duration.pbt.test.ts`; update `packages/core/test/explain.test.ts` and any `explain*.pbt.test.ts` for the new wording ("about 11 h to 35 h", "about 20 min to 1 h"); keep `apps/web/test/ground-stop-durations.pbt.test.ts` passing and add the "Lasted " agreement check.
    - **Property 8: Duration text agrees across surfaces**
    - **Validates: Requirements 20.1, 20.2, 20.3, 20.4**

- [x] 21. Settings Account card spacing
  - [x] 21.1 Remove the empty band and stray divider above the "Account" heading
    - Find the Settings pane class and the `.account-section` rule in `apps/web/src/styles/`; add an override scoped to the Settings pane that sets `border-top: 0` and `padding-top: 0`. CSS only; no DOM change.
    - _Requirements: 21.1, 21.2_

  - [x] 21.2 Write the CSS assertion test
    - Extend `apps/web/test/layout-css.test.ts` (or the equivalent CSS-parsing test) to assert the scoped override exists with both declarations at zero.
    - _Requirements: 21.3_

- [x] 22. Webhook delivery wording
  - [x] 22.1 Choose "delivered" or "delivered at" by display mode in `WebhookSettings.tsx`
    - Read the `DisplayMode` from the same hook or context `TimeText.tsx` uses; render "delivered <TimeText>" for `relative` and "delivered at <TimeText>" for the other three modes.
    - _Requirements: 22.1, 22.2_

  - [x] 22.2 Write tests for both wordings
    - Extend `apps/web/test/webhook-settings.test.tsx`: relative mode shows "delivered 18 h ago" with no "at"; each absolute mode shows "delivered at".
    - **Property 9: Webhook connector depends only on the display mode**
    - **Validates: Requirements 22.1, 22.2, 22.3**

- [x] 23. Watchlist status pill
  - [x] 23.1 Show the derived status next to the Watching pill
    - Find the signed-in Watchlist table component; render the status pill (Ground stop, Recovering, Operating normally) from the helper of Task 19.3 inside the existing Status_Cell, after the "Watching" or "Not watching" pill. Cell content only; no `<tr>`/`<td>` change. With no status response, render only the Watching pill as today.
    - _Requirements: 23.1, 23.2, 23.3_

  - [x] 23.2 Write the Watchlist tests
    - Add tests in `apps/web/test/` asserting each of the three status pills renders next to both "Watching" and "Not watching", and that the table's cell count per row is unchanged.
    - _Requirements: 23.3, 23.4_

- [x] 24. Hook fires after save under `packages/core/src/`
  - [x] 24.1 Change `.kiro/hooks/require-test-update.json` and verify the matcher
    - Set `trigger` to `PostFileSave` and `matcher` as in `design.md` section 14; reword the prompt for a file that was just saved.
    - Verify the matcher with a one-off script against these paths: match `packages/core/src/status-derivation.ts` and `packages\core\src\explain.ts`; no match `docs/hooks.md`, `packages/core/test/explain.test.ts`, `apps/web/src/lib/incident-feed.ts`. Confirm the file parses as JSON.
    - _Requirements: 24.1, 24.2, 24.4, 24.5_

  - [x] 24.2 Update `docs/hooks.md` and `docs/kiro-usage.md`
    - Rewrite Hook 2 in `docs/hooks.md` and item 2 of the Hooks section in `docs/kiro-usage.md`: new trigger and matcher, and the reason (the `PreToolUse` version interrupted every write, including docs). Replace the outdated "Limits" bullets as described in `design.md` section 14 and add a History line dated 2026-11-25.
    - _Requirements: 24.3_

- [-] 25. Checkpoint - Second round
  - Run `npm test`, `npm run typecheck` and the web build (`npm run build -w apps/web`), and parse every file in `.kiro/hooks/` as JSON. Ensure all pass, ask the user if questions arise. Do not commit, push, or deploy.
  - _Requirements: 18.6, 19.5, 20.4, 21.3, 22.3, 23.4, 24.5_

- [~] 16. Owner Preview review
  - Runs after Task 25. Deploy or point the owner to the Vercel Preview of this branch (signed-out views, per the existing rollout pattern in `.kiro/specs/ui-improvements/requirements.md`) and a phone-width view, and ask the owner to confirm all 11 fixes read correctly, including the Requirement 7.3 wording question flagged in `design.md`. For the second round, also ask the owner to confirm the seven fixes of Requirements 18 to 24 (the live ORD incident, Recovering length, likely-impact wording, Account card, webhook wording, Watchlist status, hook).
  - _Requirements: all_

- [~] 17. Ship
  - Runs after Task 16. Confirm every checkpoint, Task 25 and the owner Preview review passed; remind the owner that fast-forwarding and pushing `main` before the Deadline (December 4, 2026, 2:00 PM PT) is a manual step performed by the owner, not by this task.
  - _Requirements: all_

## Notes

- Second round: Task 16 and Task 17 depend on Tasks 18 to 25. In the dependency graph Task 25 is wave 16, Task 16 is wave 17 and Task 17 is wave 18. Task 18.1 writes the Task 18.2 test first to prove the failure, then fixes; the test file is listed in the later wave so the final run covers the combined result of Tasks 18 and 19.

- Tasks marked with `*` are optional and can be skipped for a faster ship, but Requirement 1 (Task 1.2/1.3) and Requirement 11 (Task 13.2) carry the two property tests that most directly protect against regressions in the pairing logic and the time-zone conversion; skipping them trades confidence for speed.
- Requirement 2 (the Core investigation) has no tasks: its finding is recorded in `design.md`'s "Investigation" section, and no file under `packages/core/` is touched by this spec.
- Task 16 and Task 17 are the only two tasks in this plan that are not pure coding tasks; they exist to satisfy the "one owner Preview/phone review task, one ship task" structure the owner asked for, and neither performs a commit, push, or deploy itself.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4"] },
    { "id": 2, "tasks": ["2.1", "4.1", "5.1", "5.2", "7.1", "8.1", "8.2", "10.1", "11.1", "11.2", "13.1", "14.1"] },
    { "id": 3, "tasks": ["2.2", "4.2", "5.3", "7.2", "7.3", "8.3", "10.2", "11.3", "13.2", "14.2"] },
    { "id": 4, "tasks": ["2.3", "2.4", "4.3"] },
    { "id": 5, "tasks": ["3"] },
    { "id": 6, "tasks": ["6"] },
    { "id": 7, "tasks": ["9"] },
    { "id": 8, "tasks": ["13.3"] },
    { "id": 9, "tasks": ["13.4"] },
    { "id": 10, "tasks": ["12"] },
    { "id": 11, "tasks": ["15"] },
    { "id": 12, "tasks": ["18.1", "19.1", "20.1", "21.1", "22.1", "24.1"] },
    { "id": 13, "tasks": ["19.2", "19.3", "19.4", "20.2", "21.2", "22.2", "24.2"] },
    { "id": 14, "tasks": ["18.2", "23.1"] },
    { "id": 15, "tasks": ["23.2"] },
    { "id": 16, "tasks": ["25"] },
    { "id": 17, "tasks": ["16"] },
    { "id": 18, "tasks": ["17"] }
  ]
}
```
