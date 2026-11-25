# Implementation Plan: AeroBrief UI Review Fixes

## Overview

Build the 11 owner-approved fixes from the 2026-11-25 screenshot review on top of `.kiro/specs/ui-improvements/`. All code is TypeScript (strict), in `apps/web` only. Order: the highest-severity fix (Requirement 1, the stale "active" incident) first, then the remaining ten in the order they appear in `requirements.md`, then one owner Preview/phone review task, then one ship task.

**Guardrails for every task.**

- Never read or print `.env`, `.env.backup`, or any `.dev.vars` file.
- Do not commit, push, tag, or deploy. The owner performs the ship step manually before the Deadline (December 4, 2026, 2:00 PM PT).
- Add no runtime dependency. Icons stay inline SVG (`aria-hidden`) or the existing CSS `mask-image` span pattern; nothing inside the Status_View renders `<svg>`/`<img>`.
- Restyle with CSS and class names. The airport table, banners, and `aria-live` region DOM stay unchanged except for `Status_Cell` text content (Requirement 8). The nav bar DOM MAY change for Requirement 4; update `test/components/nav-bar.test.tsx` and `test/a11y/nav-bar.test.tsx` in the same task.
- Never lower a contrast threshold. Fix the token and add any new pair to `palettePairs`.
- `packages/core` is not modified by this spec (Requirement 2 is investigation-only; its finding is already recorded in `design.md`).

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

- [-] 16. Owner Preview review
  - Deploy or point the owner to the Vercel Preview of this branch (signed-out views, per the existing rollout pattern in `.kiro/specs/ui-improvements/requirements.md`) and a phone-width view, and ask the owner to confirm all 11 fixes read correctly, including the Requirement 7.3 wording question flagged in `design.md`.
  - _Requirements: all_

- [~] 17. Ship
  - Confirm every checkpoint and the owner Preview review passed; remind the owner that fast-forwarding and pushing `main` before the Deadline (December 4, 2026, 2:00 PM PT) is a manual step performed by the owner, not by this task.
  - _Requirements: all_

## Notes

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
    { "id": 12, "tasks": ["16"] },
    { "id": 13, "tasks": ["17"] }
  ]
}
```
