# Requirements Document

## Introduction

This document specifies AeroBrief Phase 2, round 1. The work lives on the git branch `phase-2`. The branch `main` is the live Kiroween 2026 submission and the tag `mvp-contest-2026` (commit fff8374) is the rollback point. Nothing here changes the MVP spec in `.kiro/specs/aerobrief/`.

The project owner decided that only four features are built before the Kiroween 2026 deadline (December 4, 2026, 2:00 PM PT). This is the "contest set" that `.kiro/steering/scope.md` allows to merge into `main` before the deadline:

1. Dark mode, with a System, Light and Dark toggle.
2. A high-contrast theme that meets WCAG 2.1 Level AAA.
3. A daily digest email.
4. Signed outbound webhooks, with a `text` field that Slack incoming-webhook URLs render without any Slack integration.

Every other Phase 2 item is dropped for now and listed in the appendix "Deferred (after Kiroween judging)".

Requirements 1 to 7 are cross-cutting. They keep the four features reversible: each sits behind its own Feature_Flag that is off by default, each schema change is a separate reversible Migration run only against a Neon branch, and the MVP_Test_Suite passes unchanged with every flag off. Requirements 8 and 9 specify the two themes, Requirements 10 to 12 the digest, and Requirements 13 to 18 the webhooks.

### Assumptions

1. **Flags-off equivalence.** "Behaves as `main`" means that, with every Feature_Flag off, every HTTP response body, status code and header set, every email, every database write, every outbound request and every rendered DOM on `phase-2` equals what `main` produces for the same input, and the MVP_Test_Suite passes with no file edited.
2. **Tech stack.** The approved stack in `.kiro/steering/tech.md` applies. All four features fit inside it: Resend for email, Cloudflare Workers cron for scheduling, Neon with Drizzle for storage, and Web Crypto for HMAC. No new dependency is added.
3. **No separate Workers this round.** Local `wrangler dev`, the Neon branch `phase-2` and the automated tests are enough to verify each feature before merge. The scope.md rule that Phase 2 Workers never deploy to the production Workers stays satisfied because no Phase 2 Worker is deployed at all.
4. **Webhooks are not push notifications.** The scope.md prohibition covers push notifications to devices. A webhook is an HTTPS request from AeroBrief to a URL that the User registers, so it is outside that prohibition.
5. **Same alert events.** Webhooks fire for the same Events and the same recipients as MVP Requirement 9 alert emails: GROUND_STOP_STARTED and GROUND_STOP_ENDED for Users who watch the airport, and NATIONWIDE_EVENT for Users with at least 1 airport on the Watchlist.
6. **Time.** All times are UTC. The digest hour is a UTC hour that the User picks.
7. **Production rollout is separate.** Applying a Migration to the Production_DB and turning a flag on in production are separate steps that the project owner approves. Merging a feature into `main` with its flag off changes nothing for production users.

## Glossary

Terms of the MVP spec (`.kiro/specs/aerobrief/requirements.md`) keep their meaning, including Snapshot, Event, Explanation, Watchlist, User, Session, Monitored_Airport, FAA_Event_ID, Alert_Latency, Poller, Notifier, API and Frontend. The terms below are added.

- **Feature_Flag**: A named boolean setting that turns one feature on or off. The four flags are `FEATURE_DARK_MODE`, `FEATURE_HIGH_CONTRAST`, `FEATURE_DIGESTS` and `FEATURE_WEBHOOKS`.
- **Flags_Off_Mode**: The state in which all four Feature_Flags are off.
- **MVP_Test_Suite**: The Vitest and fast-check tests, the axe accessibility suite and the repo guard that exist at tag `mvp-contest-2026`.
- **Features_Endpoint**: The read-only API route `GET /api/features` that reports the state of the four Feature_Flags.
- **Phase2_Branch_DB**: The Neon branch named `phase-2`, used for every Phase 2 Migration and test.
- **Production_DB**: The Neon database that `main` uses.
- **Migration**: One Drizzle migration file that changes the schema for one feature.
- **Down_Migration**: A SQL file stored with a Migration that restores the schema to its state before that Migration.
- **Safe_Send_Mode**: The mode in which digest emails and webhook requests go only to recipients on an Allowlist.
- **Allowlist**: The set of permitted email addresses and webhook host names configured in Worker variables.
- **Theme_Preference**: The User's stored choice of `system`, `light` or `dark`.
- **Contrast_Preference**: The User's stored choice of `standard` or `high`.
- **Theme_Variant**: One of four complete token sets: light AA (the MVP look), dark AA, high-contrast light AAA and high-contrast dark AAA.
- **Palette_Pair**: A foreground token, a background token and a size class (`normal`, `large` or `ui`) that the Frontend renders together, as listed in `palettePairs`.
- **Digest**: One email that summarizes the last 24 hours for the recipient's watched airports and for nationwide Events.
- **Digest_Preference**: A User's opt-in flag and chosen Digest_Hour.
- **Digest_Hour**: An integer from 0 to 23 that names the UTC hour at which the User wants the Digest.
- **Digest_Date**: The UTC calendar date on which a Digest is sent.
- **Webhook**: A registered HTTPS URL, owned by one User, that receives alert Events.
- **Webhook_Secret**: A per-Webhook secret value, shown once at creation, that signs deliveries.
- **Webhook_Signature**: The HMAC-SHA256 value, sent in a request header, over the timestamp and body of a delivery.
- **Webhook_Delivery**: One alert Event posted to one Webhook, identified by a Delivery_ID, including every retry of that post.
- **Delivery_ID**: A UUID that is the same on every retry of one Webhook_Delivery.
- **Replay_Window**: The maximum age, 300 seconds, of a delivery timestamp that a receiver should accept.
- **Unsafe_Host**: A webhook URL host that is an IP literal, `localhost`, a single-label name, or a name under a reserved or internal suffix.

## Requirements

### Requirement 1: Gate each feature behind its own flag

**User Story:** As a maintainer, I want each of the four features behind its own flag that is off by default, so that I can turn one off without affecting the others or the MVP.

#### Acceptance Criteria

1. THE AeroBrief SHALL define the four Feature_Flags `FEATURE_DARK_MODE`, `FEATURE_HIGH_CONTRAST`, `FEATURE_DIGESTS` and `FEATURE_WEBHOOKS`, each read from a Worker variable.
2. WHEN a Worker reads its environment, THE Worker SHALL parse each Feature_Flag with a Zod schema that accepts the strings `true` and `false` and reads an absent flag as off.
3. IF a Feature_Flag variable holds any value other than `true` or `false`, THEN THE Worker SHALL read that flag as off, SHALL log a warning that names the flag and not its value, and SHALL keep serving requests.
4. THE Worker SHALL parse the Feature_Flags in a function that is separate from the existing `parseEnv` function, so that the result of `parseEnv` for the same input stays equal to its result on `main`.
5. WHILE `FEATURE_DIGESTS` is off, THE Poller SHALL make no database query, no email request and no outbound request for the digest, and THE API SHALL answer every digest endpoint with the same `404` response as an unknown route.
6. WHILE `FEATURE_WEBHOOKS` is off, THE Notifier SHALL make no outbound webhook request and no database query for Webhooks, and THE API SHALL answer every webhook endpoint with the same `404` response as an unknown route.
7. WHILE a Feature_Flag is off, THE Frontend SHALL render no control, page, link, text or attribute that belongs only to that feature.
8. FOR ALL combinations of the four Feature_Flag values, THE flag evaluation function SHALL return one boolean per flag, and the value for each flag SHALL depend on that flag's own variable only (independence property).

### Requirement 2: Report flags to the Frontend through a read-only endpoint

**User Story:** As a maintainer, I want the web app to read the flags from the API, so that a flag turns off without redeploying the Frontend.

#### Acceptance Criteria

1. WHILE at least one Feature_Flag is on, THE API SHALL answer `GET /api/features` with status 200 and a JSON body that holds one boolean per Feature_Flag.
2. WHILE Flags_Off_Mode applies, THE API SHALL answer `GET /api/features` with the same `404` response as an unknown route, so that the route table of `main` is unchanged in behavior.
3. THE API SHALL answer `GET /api/features` without authentication, with no cookie and no database query, and with the header `Cache-Control: no-store`.
4. THE API SHALL keep the existing `routes` table in `apps/api/src/routes.ts` unchanged and SHALL register the Phase 2 routes from a separate table, so that the existing route-table test passes unchanged.
5. WHEN the Frontend starts, THE Frontend SHALL request `/api/features` once and SHALL apply the returned flags to the current page.
6. IF the request to `/api/features` returns a non-2xx status, does not finish within 3 seconds, fails with a network error or returns a body that fails Zod validation, THEN THE Frontend SHALL treat all four flags as off and SHALL render the MVP application.
7. WHEN the Frontend renders without a flags provider, THE Frontend SHALL treat all four flags as off, so that every existing component test renders as before.
8. THE Frontend SHALL accept no flag value from the URL, local storage or a build-time variable in a production build.

### Requirement 3: Preserve MVP behavior and tests with every flag off

**User Story:** As a maintainer, I want `phase-2` with all flags off to behave as `main`, so that turning every flag off returns the contest MVP.

#### Acceptance Criteria

1. WHILE Flags_Off_Mode applies, THE MVP_Test_Suite SHALL pass on `phase-2` with no existing test file edited, deleted or skipped.
2. WHILE Flags_Off_Mode applies, THE AeroBrief SHALL produce HTTP responses, emails, database writes, outbound requests and rendered DOM equal to those of `main` for the same input.
3. THE AeroBrief SHALL leave `apps/web/src/styles/tokens.css`, the `palette` object and the `palettePairs` array unchanged in content, so that `palette-sync.test.ts` and `contrast.test.ts` pass unchanged.
4. THE Frontend SHALL leave the DOM structure of the airport table, the banners, the nav bar and the `aria-live` regions unchanged, as `.kiro/steering/design.md` requires.
5. THE AeroBrief SHALL list in the appendix "MVP Preservation Matrix" each MVP requirement and each MVP test that a feature touches, and SHALL state how each stays preserved in Flags_Off_Mode.
6. WHEN a feature section of the plan finishes, THE plan SHALL include one checkpoint that runs the MVP_Test_Suite in Flags_Off_Mode and one checkpoint that runs that feature's tests with its flag on.
7. WHILE its flag is on, THE feature SHALL leave the MVP behavior that is not named in this document unchanged, including alert emails, the Watchlist cap of 10 airports, the 24-hour history and the 20 Monitored_Airports.
8. THE AeroBrief SHALL add no runtime dependency and no devDependency for any of the four features.
9. THE repo guard SHALL keep passing, and the new database schema SHALL declare no column or field whose name contains the word `password`, `passwd` or `pass`.

### Requirement 4: Make schema changes reversible and isolated

**User Story:** As a maintainer, I want each schema change to be its own reversible Migration run only on a Neon branch, so that the Production_DB is never at risk before merge.

#### Acceptance Criteria

1. THE AeroBrief SHALL implement the digest schema and the webhook schema as two separate Migrations, and SHALL implement dark mode and high contrast with no Migration.
2. THE AeroBrief SHALL store with each Migration a Down_Migration SQL file in `packages/db/migrations/down/` that removes every object that the Migration created and changes nothing else.
3. THE AeroBrief SHALL write each Migration as additive: new tables, new indexes, new triggers and new functions only, with no change to an MVP table, column, constraint or trigger.
4. THE MVP tables `airports`, `snapshots`, `events`, `subscriptions`, `alert_log`, `users`, `sessions`, `magic_links`, `job_runs` and `poller_lease` SHALL keep every column, type and constraint.
5. THE AeroBrief SHALL run Phase 2 Migrations only against the Phase2_Branch_DB.
6. IF the database URL given to a migration command does not identify the Phase2_Branch_DB, THEN THE migration command SHALL stop before it runs any statement and SHALL report which target it refused.
7. WHEN a Migration is applied and then its Down_Migration is applied on a copy of the Phase2_Branch_DB, THE resulting schema SHALL equal the schema before the Migration (round-trip property).
8. THE AeroBrief SHALL document for each Migration the grants that the Worker runtime role needs on the new tables, because the MVP migrations leave grants to a manual step.
9. WHEN a feature is merged into `main`, THE Migration of that feature SHALL stay unapplied to the Production_DB until the project owner approves that step.

### Requirement 5: Verify before merge with local tooling and send safely

**User Story:** As a project owner, I want to test the digest and the webhooks without any chance of reaching a real user, so that nothing leaves the test environment before merge.

#### Acceptance Criteria

1. THE AeroBrief SHALL verify each feature before merge with the Vitest and fast-check tests, `wrangler dev` using `--test-scheduled` for the cron handler, and the Phase2_Branch_DB, and SHALL deploy no Phase 2 Worker.
2. THE Phase2_Branch_DB SHALL hold no User, Session or Watchlist row copied from the Production_DB, and THE plan SHALL include a task that removes such rows after the branch is created and seeds test Users with allowlisted addresses.
3. WHILE `FEATURE_DIGESTS` or `FEATURE_WEBHOOKS` is on and the variable `SAFE_SEND_MODE` is absent or `true`, THE Worker SHALL run in Safe_Send_Mode.
4. WHILE Safe_Send_Mode applies, THE Notifier SHALL send a Digest only to an email address on the Allowlist or to the Resend test address `delivered@resend.dev`.
5. WHILE Safe_Send_Mode applies, THE Notifier SHALL post a webhook only to a URL whose host is on the Allowlist of webhook hosts.
6. IF a recipient or host is not on the Allowlist, THEN THE Notifier SHALL make no call to Resend or to the webhook URL and SHALL record the skip with the reason `not_allowlisted`.
7. IF the Allowlist variable is absent or empty, THEN THE Notifier SHALL treat the Allowlist as empty and SHALL send no digest and no webhook request.
8. THE Notifier SHALL leave alert emails (MVP Requirement 9) outside Safe_Send_Mode, so that alert email behavior stays equal to `main`.
9. FOR ALL recipient lists and Allowlists, THE recipient filter SHALL return only recipients that are on the Allowlist and SHALL never return a recipient that is not on it (invariant property).

### Requirement 6: Merge one feature at a time and roll back by flag or revert

**User Story:** As a project owner, I want each feature to merge into `main` on its own and to be removable, so that a failing feature never blocks or damages the others.

#### Acceptance Criteria

1. THE plan SHALL contain one task section per feature, ordered by merge order, and each section SHALL hold the flag, the Migration where one exists, the implementation, the tests, a Flags_Off_Mode checkpoint, a flags-on checkpoint and a merge task.
2. THE AeroBrief SHALL implement each feature in commits that touch no code of another feature, except the shared flag helpers and shared test helpers.
3. THE plan SHALL allow a feature to merge into `main` only after its tests pass with its flag off and with its flag on.
4. THE plan SHALL merge no feature into `main` after December 4, 2026, 2:00 PM PT, and SHALL hold `main` frozen from that moment until Kiroween 2026 judging has finished.
5. IF a feature fails after merge, THEN THE maintainer SHALL turn its flag off, or revert that feature's commits with `git revert`, and the other features SHALL still build and pass their tests.
6. THE tag `mvp-contest-2026` SHALL stay unmoved and SHALL remain the fallback for the whole submission.
7. THE plan SHALL mark every task that creates a resource, changes a production workflow or touches the Production_DB as "needs user approval", and SHALL schedule no push, tag move or deploy, because the project owner pushes all four features together at the end.
8. THE plan SHALL include a task, marked "needs user approval", that adds `if: github.ref == 'refs/heads/main'` to the job of `.github/workflows/deploy-workers.yml`, so that a manual dispatch from another branch cannot deploy the production Workers.

### Requirement 7: Keep the scope prohibitions

**User Story:** As a project owner, I want the prohibited items to stay out, so that the contest build stays inside its boundaries.

#### Acceptance Criteria

1. THE AeroBrief SHALL include no scraping of any site, no FAA SWIM integration, no push notification to a device, no map view, no native mobile app and no user password in any of the four features.
2. THE AeroBrief SHALL authenticate Users only with Magic_Links.
3. THE webhook sender SHALL call no Slack API and no PagerDuty API, and SHALL import no Slack or PagerDuty SDK.
4. IF a request would break a boundary in `.kiro/steering/scope.md`, THEN THE AeroBrief team SHALL refuse it, name the boundary, and implement no partial or workaround version.

### Requirement 8: Offer dark mode with a System, Light and Dark choice

**User Story:** As a user, I want a dark theme that follows my system setting or my own choice, so that I can read AeroBrief comfortably in low light.

#### Acceptance Criteria

1. WHERE `FEATURE_DARK_MODE` is on, THE Frontend SHALL show a native radio group labelled "Theme" with the options "System", "Light" and "Dark", in a section that is outside the nav bar and the footer.
2. WHEN a User selects an option, THE Frontend SHALL store the Theme_Preference in local storage under the key `aerobrief.theme` and SHALL apply the resulting Theme_Variant without reloading the page.
3. WHERE `FEATURE_DARK_MODE` is on and the stored value is absent or not one of `system`, `light` and `dark`, THE Frontend SHALL use `system`.
4. WHILE the Theme_Preference is `system`, THE Frontend SHALL use the dark Theme_Variant when the browser reports `prefers-color-scheme: dark` and the light Theme_Variant otherwise, and SHALL follow a change of that setting without a reload.
5. THE Frontend SHALL apply a Theme_Variant by setting one attribute on the `html` element from script, and SHALL NOT use a CSS `prefers-color-scheme` media query in any style rule, so that Flags_Off_Mode renders the MVP look.
6. WHILE `FEATURE_DARK_MODE` is off, THE Frontend SHALL ignore any stored Theme_Preference, SHALL set no theme attribute and SHALL write nothing to local storage.
7. THE Frontend SHALL define the dark token set in new files and SHALL register every dark color token and every dark Palette_Pair in a typed module that mirrors `palette.ts` and `palettePairs`.
8. FOR ALL Palette_Pairs in `palettePairs`, THE dark token set SHALL give a contrast ratio of at least 4.5:1 for `normal`, at least 3:1 for `large` and at least 3:1 for `ui` (WCAG 2.1 Level AA).
9. THE Frontend SHALL keep every status readable from its text, so that dark mode changes only color and never the meaning or wording of a status.
10. THE Frontend SHALL use only the `fieldset`, `legend`, `input type="radio"` and `label` elements for the Theme control, reachable by keyboard with a visible focus indicator.
11. FOR ALL combinations of Theme_Preference, system setting, Contrast_Preference and flag values, THE theme resolution function SHALL return exactly one Theme_Variant (totality property).
12. FOR ALL inputs in which `FEATURE_DARK_MODE` and `FEATURE_HIGH_CONTRAST` are both off, THE theme resolution function SHALL return the light AA Theme_Variant (flag-off property).
13. THE axe accessibility suite SHALL run the Status, Airport, Watchlist, Sign-in and unsubscribe pages in the dark Theme_Variant and SHALL fail on any violation.

### Requirement 9: Offer a high-contrast theme that meets WCAG 2.1 Level AAA

**User Story:** As a user with low vision, I want an opt-in high-contrast theme, so that I can read every status without strain.

#### Acceptance Criteria

1. WHERE `FEATURE_HIGH_CONTRAST` is on, THE Frontend SHALL show a native checkbox labelled "High contrast" in the same section as the Theme control, or in a section of its own when `FEATURE_DARK_MODE` is off.
2. WHEN a User changes the checkbox, THE Frontend SHALL store the Contrast_Preference in local storage under the key `aerobrief.contrast` and SHALL apply the resulting Theme_Variant without reloading the page.
3. WHERE `FEATURE_HIGH_CONTRAST` is on and the stored value is absent or not one of `standard` and `high`, THE Frontend SHALL use `standard`.
4. THE Frontend SHALL NOT turn on high contrast from `prefers-contrast` or any other system setting.
5. WHILE the Contrast_Preference is `high` and `FEATURE_DARK_MODE` is on, THE Frontend SHALL combine high contrast with the resolved light or dark mode and SHALL use the high-contrast light or the high-contrast dark Theme_Variant accordingly.
6. WHILE the Contrast_Preference is `high` and `FEATURE_DARK_MODE` is off, THE Frontend SHALL use the high-contrast light Theme_Variant.
7. WHILE the Contrast_Preference is `standard` or `FEATURE_HIGH_CONTRAST` is off, THE Frontend SHALL render the same Theme_Variant that it renders when the high-contrast feature does not exist, and SHALL change no token value.
8. FOR ALL Palette_Pairs in `palettePairs`, THE high-contrast light and high-contrast dark token sets SHALL give a contrast ratio of at least 7:1 for `normal`, at least 4.5:1 for `large` and at least 4.5:1 for `ui`.
9. THE Frontend SHALL derive the high-contrast Palette_Pairs from `palettePairs`, so that every pair that exists in the AA look exists in each AAA Theme_Variant.
10. THE Frontend SHALL give the focus outline in each high-contrast Theme_Variant a width of at least 3px and a contrast ratio of at least 4.5:1 against every surface it appears on.
11. WHILE `FEATURE_HIGH_CONTRAST` is on, THE axe accessibility suite SHALL run the Status, Airport, Watchlist, Sign-in and unsubscribe pages in the high-contrast light and high-contrast dark Theme_Variants and SHALL fail on any violation.
12. THE Frontend SHALL give the "Theme" and "High contrast" controls the same stored keys and behavior on every page.

### Requirement 10: Let a User opt in to a daily digest

**User Story:** As a user, I want to choose a daily digest and the hour it arrives, so that I get a summary without checking the site.

#### Acceptance Criteria

1. WHERE `FEATURE_DIGESTS` is on, THE Frontend SHALL show on the Watchlist page a section "Daily digest" with a checkbox "Send me a daily digest", a select of the 24 UTC hours labelled "Send at (UTC)" and one primary Button "Save digest settings".
2. THE API SHALL expose `GET /api/digest` and `PUT /api/digest` to a signed-in User, and SHALL store the Digest_Preference in a new table that has one row per User.
3. WHEN a User saves the Digest_Preference, THE API SHALL validate the body with a Zod schema that requires a boolean `enabled` and an integer `hour` from 0 to 23, and SHALL store the values with the time of the change.
4. IF the body of `PUT /api/digest` is invalid, THEN THE API SHALL return a 400 validation error and SHALL leave the stored Digest_Preference unchanged.
5. THE API SHALL default the Digest_Preference to `enabled` false for a User who has no stored row.
6. WHEN a User deletes the account, THE API SHALL delete the Digest_Preference and every digest delivery record of that User in the same operation that deletes the account.
7. THE Frontend SHALL show the saved state and any error as visible text, and SHALL announce the result of a save in an ARIA live region without moving focus.
8. WHILE the Watchlist of the User holds 0 airports, THE Frontend SHALL show the text "Add an airport to receive a digest" next to the checkbox.

### Requirement 11: Send one digest per User per day

**User Story:** As a user, I want one digest at my chosen hour, so that I learn what happened in the last 24 hours at my airports.

#### Acceptance Criteria

1. WHERE `FEATURE_DIGESTS` is on, THE Poller SHALL run the digest job on a cron trigger at minute 0 of every UTC hour.
2. WHEN the digest job runs at a UTC hour H, THE Poller SHALL select each User whose Digest_Preference is enabled, whose Digest_Hour is H or is up to 3 hours earlier than H, and who has no digest delivery record for the current Digest_Date.
3. THE Poller SHALL skip a User whose Digest_Preference was last changed after the scheduled instant (Digest_Date at the Digest_Hour), so that a User who enables the digest after that instant waits until the next Digest_Date.
4. THE Poller SHALL skip a User whose Watchlist holds 0 airports.
5. THE Poller SHALL claim one delivery record per User and Digest_Date with an insert that fails on a duplicate, and SHALL send the Digest only when the claim succeeds.
6. THE Poller SHALL send each Digest through Resend with an idempotency key derived from the User identifier and the Digest_Date.
7. THE Digest SHALL list, for each watched airport, its current status as text and its Events from the last 24 hours, and SHALL list the NATIONWIDE_EVENT Events from the last 24 hours, each with the Explanation unaltered and the Event time in UTC to the minute.
8. WHEN no Event occurred in the last 24 hours for the User's airports and no NATIONWIDE_EVENT occurred, THE Poller SHALL still send the Digest, and the Digest SHALL state "No disruptions at your airports in the last 24 hours" followed by the current status of each watched airport.
9. IF the latest Snapshot is older than 10 minutes or is missing, THEN THE Digest SHALL include a notice that gives the capture time of the latest Snapshot and states that the data may be out of date.
10. IF Resend rejects a Digest or does not respond within 10 seconds, THEN THE Poller SHALL retry up to 2 more times and SHALL record one final outcome of `handed_off` or `failed` for that User and Digest_Date.
11. IF the Poller selects a User and the send fails, THEN THE Poller SHALL leave the failed claim in place and SHALL NOT send a second Digest for that Digest_Date.
12. THE Digest SHALL contain no raw FAA code, a link to the Watchlist page, and the digest unsubscribe link of Requirement 12.
13. IF a database error or an email error occurs for one User, THEN THE Poller SHALL log the error without the email address and SHALL continue with the remaining Users.
14. FOR ALL sets of Digest_Preferences, delivery records and run instants, THE due-user selection function SHALL return each User at most once, SHALL return no User whose record for that Digest_Date exists, and SHALL return no User outside the 3-hour catch-up window (invariant property).
15. FOR ALL sequences of digest job runs on one Digest_Date, THE Poller SHALL send at most one Digest per User (idempotence property).
16. FOR ALL Digest inputs, THE Digest composer SHALL return text and HTML that contain every airport name, every Explanation and every Event time of the input, and SHALL return a subject of at most 100 characters (invariant property).

### Requirement 12: Let a recipient unsubscribe from the digest with a signed link

**User Story:** As a recipient, I want a one-click link in the digest that stops it, so that I control my mail without signing in.

#### Acceptance Criteria

1. THE Digest SHALL contain one unsubscribe link whose signature is the base64url HMAC-SHA256 of the text `digest.` followed by the User identifier, keyed with the unsubscribe secret.
2. THE signature SHALL differ from every per-airport unsubscribe signature of MVP Requirement 9.8 for the same User, so that a link of one kind never verifies as the other kind.
3. WHEN the API receives `POST /api/digest/unsubscribe` with a valid signature, THE API SHALL set `enabled` to false for that User and SHALL return a confirmation.
4. WHEN the API receives a valid digest unsubscribe request for a User whose Digest_Preference is already disabled, THE API SHALL return the same confirmation (idempotence property).
5. IF the signature is missing, malformed or invalid, THEN THE API SHALL return status 403 and SHALL change nothing.
6. THE API SHALL verify the signature against the current unsubscribe secret and against the previous secret while its expiry has not passed, as `acceptedUnsubscribeSecrets` does for the per-airport link.
7. THE Frontend SHALL show a page for the digest unsubscribe link that states in text whether the digest was stopped, and SHALL render no such page while `FEATURE_DIGESTS` is off.
8. FOR ALL User identifiers and secrets, signing then verifying a digest signature SHALL return true, and verifying it after any change to the User identifier or the signature SHALL return false (round-trip property).
9. THE Digest SHALL carry no `List-Unsubscribe` header, because the signed link in the body is the only unsubscribe mechanism.

### Requirement 13: Let a User register a few signed webhooks

**User Story:** As an integrator, I want to register a URL that receives AeroBrief alerts, so that my own tools and my Slack channel hear about ground stops.

#### Acceptance Criteria

1. WHERE `FEATURE_WEBHOOKS` is on, THE Frontend SHALL show on the Watchlist page a section "Webhooks" that lists the User's webhooks, a form to add one, and a delete control for each.
2. THE API SHALL let a signed-in User register at most 3 webhooks, and SHALL enforce that limit in the database so that two concurrent requests cannot exceed it.
3. IF a User already has 3 webhooks, THEN THE API SHALL reject another registration with a validation error and SHALL leave the existing webhooks unchanged.
4. WHEN a User registers a URL that passes the validation of Requirement 14, THE API SHALL generate the Webhook_Secret and SHALL return it once in the response of that request.
5. THE API SHALL return the Webhook_Secret in no later response, and THE Frontend SHALL show it once with the text that it cannot be shown again.
6. THE API SHALL return for each webhook only its identifier, its host name, its creation time, its state (`active` or `disabled`) and its last delivery outcome, and SHALL NOT return the full URL after creation.
7. THE API SHALL write neither the full URL nor the Webhook_Secret to any log.
8. WHEN a User deletes a webhook, THE API SHALL delete that webhook and its delivery records.
9. WHEN a User deletes the account, THE API SHALL delete every webhook and every delivery record of that User in the same operation.
10. THE API SHALL derive each Webhook_Secret from a master secret held in the Worker secret `WEBHOOK_MASTER_SECRET` and from the webhook identifier, and SHALL store no copy of the Webhook_Secret in the database.
11. THE Webhook_Secret SHALL carry at least 32 bytes of derived output, shown as `whsec_` followed by base64url text.
12. IF `FEATURE_WEBHOOKS` is on and `WEBHOOK_MASTER_SECRET` is missing or shorter than 32 characters, THEN THE Worker SHALL answer the webhook endpoints with a 503 error that names the missing variable and SHALL send no webhook.
13. THE API SHALL store the full URL as plain text in the database, because the sender needs it to post, and SHALL mask the URL in every API response and every error message by showing the host name only.

### Requirement 14: Reject unsafe webhook URLs

**User Story:** As a maintainer, I want unsafe webhook targets rejected, so that AeroBrief cannot be used to reach internal or private services.

#### Acceptance Criteria

1. WHEN a User submits a webhook URL, THE API SHALL parse it with the WHATWG URL parser and SHALL accept it only when the scheme is `https`.
2. IF the URL has a username or password, a port other than 443, a fragment, or a length over 2048 characters, THEN THE API SHALL reject it with a validation error.
3. IF the host is an Unsafe_Host, THEN THE API SHALL reject the URL with a validation error. An Unsafe_Host is an IPv4 literal in any notation that the URL parser normalizes to dotted decimal, an IPv6 literal, `localhost` or any name ending in `.localhost`, a name with a single label, and a name ending in `.local`, `.internal`, `.lan`, `.home.arpa`, `.test`, `.invalid` or `.example`.
4. IF the URL host ends with a trailing dot, THEN THE API SHALL reject the URL.
5. THE webhook sender SHALL run the same validation again before each request, so that a stored row that fails the validation is never contacted.
6. THE webhook sender SHALL send each request with the redirect mode `manual` and SHALL treat any 3xx response as a failed attempt without following it.
7. THE webhook sender SHALL ignore the response body, SHALL cancel it without reading it, and SHALL store only the numeric status code and an error kind.
8. THE webhook sender SHALL abort an attempt that takes longer than 5 seconds.
9. THE webhook sender SHALL return no response detail from the target to the User or to the logs.
10. THE URL validator SHALL be a pure function in `packages/core` that takes a string and returns either the normalized URL or a reason code.
11. FOR ALL strings, THE URL validator SHALL return a normalized URL only when the scheme is `https`, the host is not an Unsafe_Host and the port is 443 (safety property).
12. FOR ALL IPv4 addresses written in dotted, decimal, hexadecimal, octal or mixed notation, and for ALL IPv6 addresses, THE URL validator SHALL return a reason code (error-condition property).
13. FOR ALL valid normalized URLs that the validator returns, validating the returned value again SHALL return the same value (idempotence property).

### Requirement 15: Sign every webhook delivery

**User Story:** As an integrator, I want to verify that a request came from AeroBrief and is fresh, so that I can ignore forged and replayed requests.

#### Acceptance Criteria

1. THE webhook sender SHALL send each delivery as an HTTP POST with the header `Content-Type: application/json`, a JSON body of at most 4096 bytes, and the headers `X-AeroBrief-Delivery`, `X-AeroBrief-Timestamp` and `X-AeroBrief-Signature`.
2. THE webhook sender SHALL set `X-AeroBrief-Timestamp` to the current Unix time in seconds, and SHALL set `X-AeroBrief-Signature` to `v1=` followed by the lowercase hexadecimal HMAC-SHA256 of the text `<timestamp>.<body>` keyed with the Webhook_Secret.
3. THE webhook sender SHALL set `X-AeroBrief-Delivery` to the Delivery_ID, and SHALL send the same Delivery_ID on every retry of one Webhook_Delivery.
4. THE webhook sender SHALL compute a new timestamp and a new signature for each attempt, so that every attempt falls inside the Replay_Window.
5. THE AeroBrief SHALL provide a pure verify function in `packages/core` that takes the secret, the timestamp, the body, the signature header and the current time, and that returns true only when the signature matches and the timestamp is within 300 seconds of the current time.
6. THE verify function SHALL compare signatures in constant time.
7. THE AeroBrief SHALL document in `docs/` the header names, the signed text, the Replay_Window and a verification example in TypeScript.
8. FOR ALL secrets, timestamps and bodies, THE verify function SHALL accept the signature that the sign function produced for the same inputs when the current time is within the Replay_Window (round-trip property).
9. FOR ALL secrets, timestamps and bodies, THE verify function SHALL reject the delivery after any change to the body, the timestamp, the signature or the secret (error-condition property).
10. FOR ALL signatures that are valid at timestamp T, THE verify function SHALL reject them when the current time is more than 300 seconds after T or more than 300 seconds before T (replay property).

### Requirement 16: Retry failed webhook deliveries and disable failing webhooks

**User Story:** As an integrator, I want AeroBrief to retry briefly and then stop calling a dead endpoint, so that a broken receiver neither loses alerts too easily nor receives endless requests.

#### Acceptance Criteria

1. WHEN the Poller stores a Snapshot that yields alert Events, THE Notifier SHALL create one Webhook_Delivery for each active webhook of each recipient, after the alert emails of those Events have been handed off or recorded.
2. THE Notifier SHALL start the first attempt of each Webhook_Delivery within 120 seconds of the Snapshot being stored.
3. THE Notifier SHALL claim one delivery record per Event key, Event type and webhook with an insert that fails on a duplicate, and SHALL send only when the claim succeeds, so that a retried poll sends no second delivery for the same Event.
4. IF an attempt ends with a network error, a timeout, status 408, status 429 or a status of 500 or higher, THEN THE Notifier SHALL retry, up to 3 attempts in total, with a wait of 2 seconds before the second attempt and 8 seconds before the third.
5. IF an attempt ends with any other non-2xx status, including a 3xx status, THEN THE Notifier SHALL stop and record the delivery as failed without a retry.
6. WHEN an attempt ends with a 2xx status, THE Notifier SHALL record the delivery as `delivered`.
7. THE Notifier SHALL record for each Webhook_Delivery one final outcome (`delivered`, `failed` or `skipped`), the number of attempts, the last status code or error kind, and the completion time.
8. THE Notifier SHALL log each final outcome with the Delivery_ID, the webhook identifier and the host name, and SHALL log no URL, secret or response detail.
9. IF a webhook has 5 consecutive Webhook_Deliveries with the final outcome `failed`, THEN THE Notifier SHALL set that webhook to `disabled` with a reason and a time, and SHALL send it no further delivery.
10. WHEN a Webhook_Delivery ends with the outcome `delivered`, THE Notifier SHALL reset the consecutive failure count of that webhook to 0.
11. THE Notifier SHALL leave the consecutive failure count unchanged for a delivery with the outcome `skipped`.
12. THE Frontend SHALL show a disabled webhook with the text "Disabled after repeated failures" and the time of the last outcome.
13. WHILE the latest Snapshot is older than 10 minutes or is missing, THE Notifier SHALL send no webhook, as MVP Requirement 6.8 states for alert emails.
14. IF a webhook attempt throws or fails, THEN THE Notifier SHALL leave alert email delivery, its records and its outcomes unchanged.
15. FOR ALL sequences of attempt results, THE retry function SHALL stop after at most 3 attempts and SHALL return a final outcome (bound property).
16. FOR ALL sequences of final outcomes, THE failure counter SHALL equal the number of consecutive `failed` outcomes at the end of the sequence, and SHALL disable the webhook exactly when that number reaches 5 (invariant property).
17. WHEN a webhook is set to `disabled`, THE Notifier SHALL send no email and no other notification about it, and THE Frontend SHALL show the disabled state of Acceptance Criterion 12 on the Watchlist page.
18. WHEN a User re-enables a `disabled` webhook with the Watchlist page control "Re-enable", THE API SHALL set the state to `active`, reset the consecutive failure count to 0 and clear the disabled reason and time.
19. IF a User re-enables a webhook that is already `active`, THEN THE API SHALL return the same result and change nothing (idempotence property).

### Requirement 17: Send a payload that a Slack incoming webhook can render

**User Story:** As an integrator, I want a `text` field in the payload, so that I can paste a Slack incoming-webhook URL and see a readable message.

#### Acceptance Criteria

1. THE webhook sender SHALL send a JSON payload with the fields `id`, `type`, `createdAt`, `data` and `text`, validated by a Zod schema in `packages/core/src/schemas/` before it sends.
2. THE `type` field SHALL be `ground_stop.started`, `ground_stop.ended` or `nationwide.event`, matching the Event type, or `TEST` for the test event of Requirement 18.
3. THE `data` field SHALL hold the FAA_Event_ID or Event key, the airport identifier and airport name (or null for a nationwide Event), the Event time in ISO 8601 UTC, and the Explanation unaltered.
4. THE `text` field SHALL be one plain-language line that holds the airport name, the Event type in words, the Explanation and the Event time in UTC to the minute, and SHALL contain no raw FAA code.
5. THE `id` field SHALL equal the Delivery_ID.
6. THE webhook sender SHALL escape in the `text` field the characters `&`, `<` and `>` as Slack incoming webhooks require, and SHALL not use Slack-specific markup.
7. THE webhook sender SHALL send no Slack-specific field, so that the same payload works for any receiver.
8. FOR ALL valid Events, THE payload builder SHALL return a payload that passes the Zod schema, whose serialized size is at most 4096 bytes, and whose `text` contains the airport name or the words "nationwide" (invariant property).
9. FOR ALL valid payloads, serializing to JSON and parsing the result with the Zod schema SHALL produce an equal payload (round-trip property).

### Requirement 18: Send a test event to a webhook

**User Story:** As an integrator, I want to send one sample delivery to my webhook, so that I can check my URL, my signature check and my Slack channel before a real alert arrives.

#### Acceptance Criteria

1. WHERE `FEATURE_WEBHOOKS` is on, THE Frontend SHALL show a button "Send test event" for each webhook of the User, and SHALL show the result as visible text and in an ARIA live region.
2. THE API SHALL expose `POST /api/webhooks/:id/test` to the signed-in owner of the webhook and SHALL answer an unknown or foreign webhook identifier with `404`.
3. WHEN a User requests a test event, THE API SHALL send one payload with `type` `TEST`, a new Delivery_ID as `id`, a `data` field that states it is a test, and a `text` field that begins with "TEST:" and states that no real disruption occurred.
4. THE API SHALL send the test event through the same URL validation (Requirement 14), signing (Requirement 15), 5-second timeout, redirect refusal, payload schema (Requirement 17) and Safe_Send_Mode checks as a real delivery.
5. THE API SHALL make one attempt for a test event, SHALL NOT retry, and SHALL return to the User the outcome (`delivered` or `failed`) with the numeric status code or the error kind, and no response body.
6. THE API SHALL allow at most 1 test event per webhook in any 60-second period, SHALL enforce that limit in the database, and IF the limit is reached THEN THE API SHALL return status 429 with the number of seconds to wait.
7. THE API SHALL NOT count a test event toward the consecutive failure count, SHALL NOT disable a webhook because of it, and SHALL NOT apply the stale-data gate to it.
8. IF a webhook is `disabled`, THEN THE API SHALL still accept a test event for it, so that the User can check the endpoint before re-enabling it.
9. FOR ALL sequences of test event request times for one webhook, THE rate-limit function SHALL allow a request only when at least 60 seconds have passed since the last allowed request (invariant property).

## Appendix A: MVP Preservation Matrix

Each row names an MVP requirement or test that a feature touches and how it stays preserved in Flags_Off_Mode. "Flags on" means the feature under test is on.

| MVP item | Touched by | Preserved in Flags_Off_Mode by | Extra check with the flag on |
| --- | --- | --- | --- |
| Req 9 (alert emails), `notifier.test.ts`, `recipients.pbt.test.ts`, `reprocess.pbt.test.ts` | Webhooks, digest | `notify()` stays unchanged. Webhooks run in a separate function that the Poller calls only when the flag is on. | Alert emails still go once per User per Event, with the same recipients. |
| Req 6.8 (no alerts on stale data), `stale-gate.pbt.test.ts` | Webhooks, digest | Stale gate stays in `notify()`. | Webhooks apply the same 10-minute gate (Req 16.13). The digest states the staleness instead (Req 11.9). |
| Req 8 (Watchlist, cap of 10), `watchlist-cap.test.ts` | Digest, webhooks | No change to the `subscriptions` table or trigger. | The digest and webhooks read the Watchlist and never write to it. |
| Req 7 (no passwords), repo guard, `schema.test.ts` | Digest, webhooks | New columns use names such as `secret_version`, never `password` or `pass`. | The repo guard scans the new schema. |
| Req 9.8 (per-airport unsubscribe), `unsubscribe*.test.ts` | Digest | `signUnsubscribe` and `verifyUnsubscribe` stay unchanged. The digest uses new functions with the prefix `digest.`. | Req 12.2 proves the two signature kinds never cross-verify. |
| Req 13 (accessibility), the axe suite in `apps/web/test/a11y/` | Both themes, digest, webhooks | Existing axe tests run unchanged against the light AA look. | New axe tests cover each Theme_Variant and the new Watchlist sections. |
| Req 15 and `.kiro/steering/design.md` (tokens, palette, DOM structure), `palette-sync.test.ts`, `contrast.test.ts` | Both themes | `tokens.css`, `palette` and `palettePairs` stay byte-identical. New token sets live in new files. | New tests check each new token set against the pairs derived from `palettePairs`. |
| Req 15.2 (nav bar), `nav-bar.test.tsx` | Both themes | The nav bar DOM stays unchanged. The theme controls render in a separate section. | The section has its own tests. |
| Req 15.12 (new color pairs pass AA) | Dark mode | Same rule, applied to the dark token set. | Dark pairs are checked in `contrast` tests. |
| Req 14 (stack, scope), `ci.yml` | All | No new dependency. | CI keeps running type checks, tests and axe. |
| Route table, `routes.test.ts`, `router.test.ts` | Flags, digest, webhooks | `routes` stays unchanged. Phase 2 routes live in a separate table and answer `404` while their flag is off. | Each new route has its own tests. |
| `env.test.ts`, `parseEnv` | Flags | Flags are parsed by a separate function. `parseEnv` output for the same input stays equal. | Flag parsing has its own tests. |
| `dispatcher.test.ts`, poller cron strings in `wrangler.jsonc` | Digest | The existing cron cases stay unchanged. The new cron case returns at once while the flag is off. | The `wrangler.jsonc` string and the `index.ts` string match. |
| Req 16 (secret rotation), `rotate-secrets.test.ts` | Digest, webhooks | The rotation script is unchanged. | The digest uses `UNSUBSCRIBE_SECRET` and its previous-secret window. `WEBHOOK_MASTER_SECRET` is outside the script (see the design). |
| Req 11 and 14.12 (24-hour history, 20 airports) | Digest | No change. | The digest reads only stored Events from the last 24 hours. |
| `deploy-workers.yml` | Deploy guard task | Behavior on `main` pushes stays unchanged. | A manual dispatch from another branch skips the job. |

## Appendix B: Deferred (after Kiroween judging)

These items are out of this round. Their requirements and flags are removed from the active set. Each stays on `phase-2` until judging has finished and the project owner re-opens it.

- More US airports: needs a data-model change for the 20-airport assumption and is not part of the contest set.
- International hubs: needs a non-FAA data source and a license review.
- Flight, tail number and route tracking: needs a licensed flight data source.
- Additional data sources (FlightAware, OAG, Cirium, ADS-B Exchange): need a licensed API, a key or contract, and a terms review.
- SMS: needs a paid provider and a terms review.
- Slack API (apps, OAuth): outside the stack and not needed, because the signed webhook with a `text` field already works with a Slack incoming-webhook URL.
- PagerDuty: needs an outside SDK or API and a terms review.
- History up to 3 years: needs a storage and retention redesign and a data-protection review.
- Trend analysis: depends on extended history.
- Machine-learning predictions: depends on extended history and needs a runtime outside the stack.
- Billing tiers: waits for a review of the FAA data terms and each provider license.
- Organization accounts: not needed by the four features and a large data-model change.
- Single sign-on: depends on organization accounts and needs a protocol library.
- User provisioning (SCIM): depends on organization accounts and single sign-on.
- Roles: depends on organization accounts.
- Audit logs: depends on organization accounts and a data-protection review.
- Alert routing rules: depends on more notification channels.
- Escalation: depends on routing rules and acknowledgement.
- API keys: not needed by the four features and needs a rate-limit design.
- Multi-region hosting: needs a database and Workers design outside this round.
- Drag-and-drop dashboards: needs a library outside the approved stack.
- White-labeling: depends on organization accounts.
- Encryption at rest for webhook URLs: the URLs are stored as plain text for now and are masked in all API output. Encryption needs a key-management design.
- Rotation of `WEBHOOK_MASTER_SECRET`: the rotation script does not cover it. Rotating it invalidates every Webhook_Secret, so Users must re-copy their secrets. A versioned derivation needs its own design.
- Separate `aerobrief-*-phase2` Workers and a Phase 2 deploy workflow: not needed, because local `wrangler dev`, the Neon branch and automated tests are enough before merge.
