# Requirements Document

## Introduction

This spec records 11 owner-approved fixes from a screenshot review conducted on 2026-11-25 of the AeroBrief web app built by `.kiro/specs/ui-refresh/` and `.kiro/specs/ui-improvements/`. The owner approved all 11 fixes for this cycle ("all"). The build ships to `main` before the Deadline. It touches `apps/web` only, with one investigation-only note about `packages/core/src/change-detector.ts` and `packages/core/src/event-keys.ts` for Fix 1 (Requirement 1); no change to those files is required by this spec unless the investigation finds a trivial, safe fix, and even then alerts and digests must not double-send as a result.

This spec follows the guardrails already in force: `.kiro/steering/tech.md` (approved stack only), `.kiro/steering/structure.md` (file layout and import rules), `.kiro/steering/design.md` (visual design hard rules), and `.kiro/steering/scope.md` (MVP boundaries). The nav bar DOM may change for Requirement 4, as the owner previously approved for nav bar navigation behavior (`.kiro/specs/ui-improvements/requirements.md`, decision 2); the airport table, banners, and `aria-live` region DOM stay unchanged per hard rule 1. No new runtime dependency is introduced.

**Second round (2026-11-25, owner: "all").** Requirements 18 to 24 add seven fixes found after the first round reached Preview. Requirement N is built by Task N, and Requirements 13 to 17 are intentionally unused. Requirement 19 changes `packages/core/src/status-derivation.ts` and Requirement 20 changes `packages/core/src/explain.ts`, so the "apps/web only" scope above no longer holds for those two; both are pure functions and keep their mirrored tests in `packages/core/test/`. Requirement 19 also supersedes Requirement 1.2 of `.kiro/specs/ui-improvements/requirements.md` by owner decision. Requirement 24 edits a Kiro hook and two docs files.

## Glossary

- **Frontend**: The React 18 + Vite app in `apps/web`.
- **Core**: The pure TypeScript package `packages/core`.
- **Incident_Feed**: The pure module `apps/web/src/lib/incident-feed.ts` that merges FAA events into `Incident` records for display.
- **Incident_Key**: The key `mergeIncidents` groups events by. Today it is the FAA event id (`faaEventId`) for ground stop events.
- **Snapshot**: One polled capture of airport ground stop state, as stored by the poller and returned by the status API.
- **Active_Ground_Stop**: A ground stop present in the current Snapshot for a given airport (`airport.groundStop !== null`).
- **Unmatched_End**: A `GROUND_STOP_ENDED` event whose Incident_Key has no corresponding `GROUND_STOP_STARTED` event in the same Incident_Feed input.
- **Unmatched_Start**: A `GROUND_STOP_STARTED` event whose Incident_Key has no corresponding `GROUND_STOP_ENDED` event in the same Incident_Feed input, and whose airport has no Active_Ground_Stop in the current Snapshot.
- **Recovery_Window**: The period after a ground stop ends during which `deriveAirportStatus` returns `"recovering"` (`RECOVERY_PERIOD_MS`, `packages/core/src/status-derivation.ts`).
- **Time_Display_Preference**: The user's chosen `DisplayMode` (`relative`, `airport_local`, `my_local`, `utc`) read by `TimeText`.
- **Danger_Outline_Button**: The `Button` `variant="danger-outline"` style already defined in `apps/web/src/styles/primitives.css` and used by `AccountSection.tsx`.
- **Confirm_Dialog**: The existing `ConfirmDialog` component (`apps/web/src/components/ConfirmDialog.tsx`).
- **Status_Cell**: The third `<td>` of each `AirportTable` row, rendered by `AirportTable.tsx` and `GroundStopDetails.tsx`.
- **Account_Menu**: The disclosure button and panel rendered by `AccountMenu.tsx` inside `NavBar.tsx` for a signed-in visitor.
- **Theme_Preview**: The `.display-settings__preview` swatch and text in `DisplaySettings.tsx` shown under the Theme control.
- **Send_Hour**: The UTC hour selected in the Daily digest "Send at (UTC)" control (`DigestSettings.tsx`).
- **Table_Rule_Token**: The `--color-table-rule` CSS custom property (`apps/web/src/styles/tokens.css`), already present in `palettePairs` usage per theme.
- **Deadline**: December 4, 2026, 2:00 PM PT.
- **Live_Fixture**: The saved production response `apps/web/test/fixtures-live-national-2026-11-25.json` from `/api/status/national`.
- **Status_View**: The `StatusView.tsx` page with its Overview, Airports and Events panes.
- **Status_Derivation**: `deriveAirportStatus` in `packages/core/src/status-derivation.ts`.
- **Recovery_Window_Limit**: The elapsed time after a ground stop ends at which an airport stops reading "recovering" (Requirement 19).
- **Explainer**: `explainStructured` in `packages/core/src/explain.ts`.

## Requirements

### Requirement 1: Incidents reflect the current snapshot and pair across FAA id changes

**User Story:** As a traveler, I want an incident card to agree with the current airport status, so that I do not read "Active" for a ground stop that the snapshot shows has ended.

#### Acceptance Criteria

1. THE Incident_Feed SHALL classify a ground-stop incident as active only when the incident's airport has an Active_Ground_Stop in the current Snapshot passed to it.
2. WHEN the Incident_Feed input contains an Unmatched_End at an airport, THE Incident_Feed SHALL pair it with the nearest earlier Unmatched_Start at the same airport, even when the two events carry different Incident_Keys, and SHALL present the pair as one incident with that start and that end.
3. WHEN the Incident_Feed input contains an Unmatched_Start whose airport has no Active_Ground_Stop in the current Snapshot and no Unmatched_End to pair with under Criterion 2, THE Frontend SHALL render that incident as ended with the text "End time not recorded" in place of a duration.
4. THE Incident_Feed SHALL make the current Snapshot an explicit input to incident classification, so that `buildIncidentFeed` or its caller receives the snapshot's active-ground-stop state per airport.
5. IF the current Snapshot is unavailable (no "ok" status), THEN THE Incident_Feed SHALL fall back to the pre-existing classification (end event present means ended) rather than treating every incident as ended.

### Requirement 2: Investigate the FAA mid-stop id change in Core (investigation only)

**User Story:** As a developer, I want to know whether `change-detector.ts` should change when the FAA changes a ground stop's id mid-stop, so that the fix in Requirement 1 is not undone by a future alert or digest bug.

#### Acceptance Criteria

1. THE design document SHALL record whether `packages/core/src/change-detector.ts` should emit a paired end-then-start when the FAA ground stop id changes mid-stop while `groundStop !== null` continues at that airport, or should keep emitting one unmatched start under the existing `faaEventId` comparison in `normalize.ts`'s `deriveFaaEventId` and the equality check in `detectChanges`.
2. THE design document SHALL record whether the alert pipeline (`apps/poller/src/notifier.ts`, `packages/core/src/event-keys.ts`'s `eventKey`/`dedupKey`) is affected by an FAA id change mid-stop, given that `eventKey` for a ground stop event is `e.faaEventId`.
3. IF the investigation finds a Core change that is both trivial and safe, THEN THE design document SHALL say so and this spec's tasks MAY include it; the task SHALL include a check that alerts do not send twice for the same real-world ground stop as a result.
4. IF the investigation finds that a Core change is not trivial or not safe within the Deadline, THEN THE design document SHALL record that finding and leave `packages/core/src/change-detector.ts` and `packages/core/src/event-keys.ts` unchanged by this spec.

### Requirement 3: Airport and Watchlist search fields are wide enough to show the placeholder

**User Story:** As a traveler, I want to read the full search hint, so that I know what to type.

#### Acceptance Criteria

1. THE Frontend SHALL set a minimum width of 24rem on the Airports search field and the Watchlist search field on viewports 768 CSS px and wider.
2. WHILE the viewport is narrower than 768 CSS px, THE Frontend SHALL render the Airports search field and the Watchlist search field at the full width of their container.
3. THE Frontend SHALL set the placeholder text of the Airports search field and the Watchlist search field to "Code or city, e.g. LAS or Las Vegas".

### Requirement 4: Signed-in navigation keeps Settings visible and marks the current page

**User Story:** As a signed-in traveler, I want Settings to stay in the main navigation and to see which page I am on, so that I do not have to open a menu to find Settings or lose my place.

#### Acceptance Criteria

1. WHILE a visitor is signed in, THE Nav_Bar SHALL show "Settings" as a top-level link alongside "Status" and "Watchlist".
2. THE Account_Menu button SHALL render an inline SVG down-arrow icon marked `aria-hidden="true"` beside its "Account" text, and SHALL carry the visual styling of a control (a bordered or filled hit area matching the nav bar's other interactive elements).
3. WHEN the current pathname matches a Nav_Bar link's `href`, THE Nav_Bar SHALL set `aria-current="page"` on that link, including the "Settings" link when the pathname is `/settings`.
4. THE existing test files `apps/web/test/components/nav-bar.test.tsx` and `apps/web/test/a11y/nav-bar.test.tsx` SHALL be updated in the same task as this change to assert the new Settings link, the down-arrow icon, and the `aria-current` behavior.

### Requirement 5: Webhook delivery times honor the time display preference

**User Story:** As a user with webhooks, I want delivery times shown in my chosen time format, so that the webhook list reads consistently with the rest of the app.

#### Acceptance Criteria

1. WHEN `WebhookSettings` renders a delivery time (`lastOutcomeAt`), THE Frontend SHALL render it with the `TimeText` component instead of the `formatTime` helper that produces "YYYY-MM-DD HH:mm UTC".
2. THE Frontend SHALL remove the `formatTime` function from `WebhookSettings.tsx` once no caller remains, or SHALL leave it only if another caller still needs it.

### Requirement 6: Webhook deletion uses the danger-outline style and asks for confirmation

**User Story:** As a user, I want to confirm before a webhook is deleted, so that I do not lose a configured webhook by mistake.

#### Acceptance Criteria

1. THE "Delete" button for a webhook item in `WebhookSettings` SHALL use the `Danger_Outline_Button` variant (`variant="danger-outline"`) instead of `variant="secondary"`.
2. WHEN a user activates "Delete" for a webhook item, THE Frontend SHALL open a `Confirm_Dialog` naming the webhook's host before calling `deleteWebhook`.
3. WHEN a user confirms deletion in the `Confirm_Dialog`, THE Frontend SHALL proceed with the existing delete behavior (API call, list update, message).
4. WHEN a user cancels the `Confirm_Dialog`, THE Frontend SHALL leave the webhook list unchanged and SHALL NOT call `deleteWebhook`.

### Requirement 7: Incident card header separates status, type, and airport; ended cards show end time and duration

**User Story:** As a traveler reading an incident card, I want the status, event type, and airport visually separated, and an ended card that tells me when it ended and how long it lasted, so that I can scan the card quickly.

#### Acceptance Criteria

1. THE `IncidentCard` header SHALL render the state label ("Active" or "Ended") as a distinct pill element (reusing `AirportStatusPill` styling or an equivalent pill treatment), visually separated by spacing from the event type text and from the airport code and name.
2. WHEN an incident has ended and its start time is known, THE `IncidentCard` SHALL show the text "Ended" followed by the end time rendered with `TimeText` and the incident's duration, in the form "Ended <TimeText> · lasted <duration>".
3. WHEN an incident has ended and its start time is not known (the Unmatched_End or Unmatched_Start case from Requirement 1), THE `IncidentCard` SHALL show the text "Started more than 24 hours ago" in place of a duration.
4. THE `IncidentCard` header layout change SHALL be achieved with CSS and class names only; the component SHALL remain outside the Status_View's `<svg>`/`<img>` restriction by continuing to use `Icon`'s `aria-hidden` mask-span pattern.

### Requirement 8: Airport table status cell uses plain-language text for normal and recovering status

**User Story:** As a traveler, I want the Airports table to say "Operating normally" instead of a negative statement about an absence, and to show "Recovering" for an airport still catching up, so that the table matches the plain-language tone used elsewhere.

#### Acceptance Criteria

1. WHEN an airport has no Active_Ground_Stop and is not within its Recovery_Window, THE `AirportTable` Status_Cell SHALL show the text "Operating normally" in place of "No ground stop reported".
2. WHEN an airport has no Active_Ground_Stop and is within its Recovery_Window, THE `AirportTable` Status_Cell SHALL show a "Recovering" pill, derived the same way `network-overview.ts` derives the "recovering" kind.
3. THE `AirportTable` SHALL make this change to Status_Cell content only; the table's row, column, and cell DOM structure SHALL remain as asserted by the existing tests in `apps/web/test/components/airport-table-details.test.tsx` and any other test that queries that structure.
4. THE existing tests that assert the literal text "No ground stop reported" SHALL be updated in the same task to assert "Operating normally".

### Requirement 9: Signed-out Watchlist page has clear visual grouping

**User Story:** As a signed-out visitor, I want the Watchlist page's sections visually separated, so that I can tell the intro, the sign-in note, Quick add, Search, and my airports apart.

#### Acceptance Criteria

1. THE `SignedOutWatchlist` intro section SHALL present the value statement and the "Sign in" button as one visual group, spaced apart from the account note below it using a spacing token from `.kiro/steering/design.md`'s Token Categories.
2. THE account note ("The daily digest and email alerts need an account...") SHALL render as its own muted line, separated from the value statement and the "Sign in" button by a spacing token.
3. THE "Quick add" section, the "Search airports" section, and the "Your airports" section SHALL each read as a distinct visual group, separated from its neighbors by a spacing token.
4. THE grouping change SHALL use only existing or newly added spacing tokens and CSS class names; no DOM element required by an existing test SHALL be removed.

### Requirement 10: Display settings tighten the high-contrast hint and replace the theme preview swatch

**User Story:** As a user adjusting display settings, I want the high-contrast description right under its label, and a theme preview that actually shows each theme's colors, so that the control is easier to read and the preview is informative.

#### Acceptance Criteria

1. THE "High contrast" option's description text SHALL render directly beneath its label with reduced vertical spacing compared to the current layout, while keeping the `aria-describedby` relationship between the checkbox and the description intact.
2. THE design document SHALL evaluate replacing the single grey `.display-settings__swatch` preview with three small labeled swatches (System, Light, Dark), each using existing theme-specific color tokens, against removing the preview entirely, and SHALL choose one option with a stated reason.
3. IF the design document chooses the three-swatch option, THEN each swatch SHALL use only color tokens that already exist for its corresponding theme (no new token is added for this purpose), and the component SHALL keep the `data-testid="theme-preview"` hook or update its one existing test (`apps/web/test/display-settings.test.tsx`) in the same task.
4. IF the design document chooses removal, THEN the task SHALL remove the `.display-settings__preview` markup and update `apps/web/test/display-settings.test.tsx` in the same task to drop the assertions that depend on it.

### Requirement 11: Digest "Send at" shows the user's local time equivalent

**User Story:** As a user setting my daily digest hour, I want to see what that UTC hour is in my own time zone, so that I do not have to convert it myself.

#### Acceptance Criteria

1. WHEN the Daily digest "Send at (UTC)" control renders, THE Frontend SHALL show, next to the selected hour's option or beside the select control, the Intl-derived local-time equivalent of that hour in the visitor's browser time zone, in a form such as "01:00 UTC (7:00 PM your time)".
2. THE local-time equivalent SHALL be computed with `Intl.DateTimeFormat` using the browser's resolved time zone, matching the pattern `TimeText`/`time-text.ts` already use for time zone resolution, and SHALL need no backend change.
3. WHEN the user changes the selected hour, THE local-time equivalent text SHALL update to match the newly selected hour before the user saves.

### Requirement 12: Lighter visual separators for webhook list items and the footer

**User Story:** As a user, I want the webhook list and the footer to use lighter dividing lines, so that the page does not look heavier than the rest of the design system.

#### Acceptance Criteria

1. THE `.webhook-settings__item` top border SHALL use the Table_Rule_Token (`--color-table-rule`) in place of the current `--color-border` value.
2. THE `.site-footer` top border SHALL be changed from its current 2px `--color-border` rule to a lighter treatment using the Table_Rule_Token, keeping the border present and visible.
3. THE change SHALL be limited to CSS token references; no new color token SHALL be introduced, and any resulting new color pair SHALL be checked against the existing `palettePairs`/contrast test suite and added if it is not already covered.

### Requirement 18: Stale-active incident fix works on the live national response

**User Story:** As a traveler, I want the Events pane and the Overview "Latest events" list to show a finished ground stop as ended, so that I do not read "Active for 23 h" for a stop the FAA lifted.

**Owner approval:** Second-round fixes, 2026-11-25 ("all"). Requirement 1 is unchanged; this requirement records that its fix does not work in production and what must hold once it does.

**Evidence:** The saved live response `apps/web/test/fixtures-live-national-2026-11-25.json` holds an ORD `GROUND_STOP_STARTED` event (incidentKey `faa:b8826b88-…`, 2026-11-24T21:25:31Z), an ORD `GROUND_STOP_ENDED` event (incidentKey `faa:8dd7eae0-…`, 2026-11-24T22:05:29Z), and an ORD airport with `groundStop: null`. With that response the live UI still shows ORD "Active for 23 h" in the Events pane and in the Overview "Latest events" list, plus an ended ORD card reading "Started more than 24 hours ago".

#### Acceptance Criteria

1. WHEN the Frontend renders the Status_View from the Live_Fixture, THE Events pane SHALL show exactly one ORD incident, in the ended state, with a duration of 40 minutes (the difference between the paired start and end times, to the minute).
2. WHEN the Frontend renders the Status_View from the Live_Fixture, THE Overview "Latest events" list SHALL show the same single ended ORD incident and SHALL show no ORD incident in the active state.
3. WHEN the Frontend renders the Status_View from the Live_Fixture, THE Frontend SHALL render no ORD card with the text "Active for" and no ORD card with the text "Started more than 24 hours ago".
4. THE Frontend SHALL apply `reconcileWithSnapshot` to every incident list that the Status_View renders from events, including the Events pane and the Overview "Latest events" list, using the same snapshot airports in each.
5. THE design document SHALL record the root cause found for why Requirement 1's fix did not take effect on the live response, naming the code path and the field or argument involved.
6. THE Frontend SHALL contain an automated test that renders the Status_View from the Live_Fixture and asserts Criteria 1, 2 and 3 for both the Events pane and the Overview "Latest events" list.

### Requirement 19: Recovering window ends at the estimate's upper bound

**User Story:** As a traveler, I want "Recovering" to last only as long as AeroBrief expects delays to last, so that an airport does not read "Recovering" for a full day after a 40-minute stop.

**Owner decision (2026-11-25):** This requirement changes Requirement 1.2 of `.kiro/specs/ui-improvements/requirements.md`, which fixed the Recovery_Window at 24 hours (`RECOVERY_PERIOD_MS`). The owner replaced that fixed period with the estimate-based window below. The decision is recorded in `docs/decisions.md` and noted here and in `design.md`.

#### Acceptance Criteria

1. WHEN a ground stop at an airport has ended and no Active_Ground_Stop exists at that airport, THE Status_Derivation SHALL return "recovering" until the elapsed time since the stop ended reaches the Recovery_Window_Limit.
2. THE Status_Derivation SHALL compute the Recovery_Window_Limit as the upper bound of the AeroBrief estimate for the ended stop (the second value of `normalizationEstimate` for that stop's duration, in minutes), clamped to a minimum of 1 hour and a maximum of 24 hours.
3. WHEN the elapsed time since the stop ended is greater than or equal to the Recovery_Window_Limit, THE Status_Derivation SHALL return "normal" for that airport.
4. IF the duration of the ended stop is unknown (the start is outside the retention window), THEN THE Status_Derivation SHALL use the maximum Recovery_Window_Limit of 24 hours.
5. THE Overview headline and chips, THE Airports table "Recovering" pill, and THE watchlist status SHALL all obtain the "recovering" decision from the same `deriveAirportStatus` call and SHALL NOT compute a separate recovery window.
6. THE property tests and unit tests of `packages/core/src/status-derivation.ts` SHALL be updated in the same task as the change, at `packages/core/test/status-derivation.test.ts` and `packages/core/test/status-derivation.pbt.test.ts`, to assert the clamp bounds and the boundary at the Recovery_Window_Limit.
7. THE file `docs/decisions.md` SHALL contain an entry dated 2026-11-25 that records this decision and names Requirement 1.2 of the ui-improvements spec as superseded.

### Requirement 20: Likely impact text formats durations with the duration formatter

**User Story:** As a traveler, I want "likely impact" to say "about 11 h to 35 h" instead of a count of raw minutes, so that I can read it at a glance.

#### Acceptance Criteria

1. WHEN `explainStructured` produces a "likely impact" sentence from an estimate, THE Explainer SHALL format the lower and upper bounds with the shared duration formatter, in the form "about <low> to <high>", for example "about 11 h to 35 h" or "about 20 min to 1 h".
2. THE Explainer SHALL output the word "minutes" as a unit for no estimate bound of 60 minutes or more.
3. THE Explainer SHALL use one duration formatter implementation for the estimate bounds and for the incident-card duration text, so that the same number of minutes reads the same way in both places.
4. THE unit tests and property tests of `packages/core/src/explain.ts` SHALL be updated in the same task as the change, at `packages/core/test/explain.test.ts` and any `explain*.pbt.test.ts` file, to assert the new wording.

### Requirement 21: Settings Account card has no empty band above its heading

**User Story:** As a signed-in user, I want the Account card to start with its heading, so that the card does not show an empty band and a stray divider.

#### Acceptance Criteria

1. THE Settings page SHALL render the "Account" heading of the Account card with no empty vertical band above it, and no divider line above it other than the card's own border.
2. THE Frontend SHALL remove the top border and the top padding that `.account-section` applies inside the Settings pane, using CSS only.
3. THE Frontend SHALL contain an automated CSS assertion test that fails when `.account-section` inside the Settings pane has a `border-top` or a `padding-top` greater than zero.

### Requirement 22: Webhook delivery text reads correctly for relative and absolute times

**User Story:** As a user with webhooks, I want "delivered 18 h ago" and "delivered at 3:05 PM", so that the sentence reads naturally in either time display.

#### Acceptance Criteria

1. WHILE the Time_Display_Preference is `relative`, THE webhook item SHALL render the delivery text as "delivered" followed by the relative time text, for example "delivered 18 h ago", with no "at" before the relative text.
2. WHILE the Time_Display_Preference is `airport_local`, `my_local`, or `utc`, THE webhook item SHALL render the delivery text as "delivered at" followed by the absolute time text.
3. THE Frontend SHALL contain automated tests that cover Criterion 1 and Criterion 2.

### Requirement 23: Signed-in Watchlist shows each airport's status

**User Story:** As a signed-in traveler, I want each Watchlist row to show whether the airport is Recovering, in a Ground Stop, or Normal, so that I can see disruption without leaving the Watchlist.

#### Acceptance Criteria

1. WHILE a visitor is signed in, THE Watchlist airport table Status_Cell SHALL show the airport's status pill (Ground stop, Recovering, or Operating normally) next to the existing "Watching" or "Not watching" pill.
2. THE Watchlist SHALL obtain the status pill from the same `deriveAirportStatus` result that Requirement 19 Criterion 5 names, and SHALL NOT compute a separate status.
3. THE Watchlist SHALL make this change to Status_Cell content only; the table's row, column, and cell DOM structure SHALL remain as asserted by the existing tests.
4. THE Frontend SHALL contain automated tests that assert the Ground stop, Recovering, and Operating normally pills next to both "Watching" and "Not watching".

### Requirement 24: The test-update hook fires after a save under packages/core/src

**User Story:** As the owner, I want the test-update hook to run after a save of a core source file only, so that it does not interrupt every write, including docs.

#### Acceptance Criteria

1. THE file `.kiro/hooks/require-test-update.json` SHALL use the trigger `PostFileSave` and a `matcher` regex on the file path that matches paths under `packages/core/src/` and no other path, written in the style of `.kiro/hooks/typecheck-on-save.json`.
2. THE hook action SHALL remain an agent prompt that asks the agent to confirm or update the mirrored tests in `packages/core/test/`, and, for `schemas.ts`, `schemas.test.ts`, `snapshot-roundtrip.pbt.test.ts` and `faa-body.pbt.test.ts`.
3. THE files `docs/hooks.md` (Hook 2) and the Hooks section of `docs/kiro-usage.md` SHALL describe the new trigger and matcher and SHALL state the reason for the change: the `PreToolUse` version with matcher `write` interrupted every write, including docs.
4. THE matcher SHALL be verified against sample paths: it SHALL match `packages/core/src/status-derivation.ts` and `packages\core\src\explain.ts`, and SHALL NOT match `docs/hooks.md`, `packages/core/test/explain.test.ts`, or `apps/web/src/lib/incident-feed.ts`.
5. THE edited hook file SHALL parse as valid JSON.

## Non-Functional Requirements

1. THE Frontend SHALL add no new runtime dependency to implement any of these 11 fixes.
2. THE Frontend SHALL NOT change the DOM structure of the airport table, the banners, or the `aria-live` region for styling purposes, per `.kiro/steering/design.md` hard rule 1.
3. THE Frontend MAY change the nav bar DOM for Requirement 4, consistent with the owner's prior approval for nav bar navigation behavior, and SHALL update the nav bar tests in the same task.
4. Each new or changed color pair introduced by these fixes SHALL pass WCAG 2.1 AA (4.5:1 normal text, 3:1 large text/component boundaries/focus indicators) and SHALL be added to `palettePairs`.
5. THE agent executing these fixes SHALL NOT read or print the contents of `.env`, `.env.backup`, or any `.dev.vars` file.
6. THE agent executing these fixes SHALL NOT commit, push, tag, or deploy; the owner performs the ship step manually before the Deadline.
