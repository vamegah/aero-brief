# Requirements Document

## Introduction

On 2026-11-24 the owner decided "Core 30, watchlist 30, keep the rest." The MVP caps (20 hardcoded airports, 10 airports per watchlist) were set only because the owner did not expect to build this fast. This feature changes two core product limits and removes the scope rules that keep finished Phase 2 work out of the Kiroween 2026 submission:

1. AeroBrief monitors the 30 airports of the FAA Core 30 list instead of 20 airports.
2. A user watchlist holds up to 30 airports instead of 10.
3. `.kiro/steering/scope.md` and the matching wording in `product.md` and other steering files are updated. The submission is `main` as of the deadline (December 4, 2026, 2:00 PM PT).

This is a change to the core product limits, not a Phase 2 feature. It has no `FEATURE_` flag. Rollback is `git revert` of the commit range plus the down migration of `0006`.

Unchanged: 24-hour history, email-only alerts, no scraping, no passwords, no device push, no map view, no native apps, no FAA SWIM, and the other rules that `scope.md` keeps (see Requirement 7).

## Glossary

- **AeroBrief**: The whole product: the Poller, the API, the web app and the database.
- **Core_30_List**: The 30 airports that the FAA ASPM help pages label "Core 30". The codes and names are in `design.md`, section "The Core 30 list".
- **Legacy_20_List**: The 20 airports in `packages/core/src/airports.ts` before this change.
- **New_Airports**: The 10 Core_30_List airports that are not in the Legacy_20_List: BWI, CLT, FLL, HNL, IAD, LGA, MDW, PHL, SAN, TPA.
- **Airport_Registry**: The `AIRPORTS` array and its helpers (`MONITORED_IDS`, `isMonitoredId`, `airportById`, `artccOf`, `ARTCC_NAMES`) in `packages/core/src/airports.ts`.
- **Snapshot**: One stored record of all monitored airports' ground stop status at one capture time.
- **Legacy_Snapshot**: A Snapshot stored before this change, which lists only the Legacy_20_List.
- **Poller**: The Cloudflare Worker in `apps/poller` that fetches the FAA feed and stores Snapshots.
- **API**: The Cloudflare Worker in `apps/api`.
- **Web_App**: The React frontend in `apps/web`.
- **Watchlist**: The set of airports one user follows. Each entry is a row in `subscriptions`.
- **Watchlist_Cap**: The largest number of airports one Watchlist may hold. The value is 30 after this change and was 10 before.
- **Cap_Trigger**: The Postgres trigger `enforce_subscription_cap`, created by migration `0001_enforce_subscription_cap`.
- **Cap_Error**: The SQLSTATE 23514 error with a message that contains "subscription limit", raised by the Cap_Trigger.
- **Migration_0006**: The new reversible migration `packages/db/migrations/0006_watchlist_cap_30.sql`, with `packages/db/migrations/down/0006_watchlist_cap_30.down.sql` as its reverse.
- **Phase2_Branch**: The Neon database branch used for Phase 2 schema work. Migration_0006 is applied there first.
- **Production_Database**: The Neon `production` branch. Only the owner changes it.
- **Owner**: The project owner. Only the Owner approves and applies changes to the Production_Database and pushes `main`.
- **Scope_Doc**: `.kiro/steering/scope.md`.
- **Decision_Log**: `docs/decisions.md`.
- **Cap_Message**: The text of the `watchlist_full` API error.

## Requirements

### Requirement 1: Core 30 coverage

**User Story:** As a traveler, I want AeroBrief to cover the FAA Core 30 airports, so that more of the busiest US airports are monitored.

#### Acceptance Criteria

1. THE Airport_Registry SHALL contain exactly the 30 airport codes of the Core_30_List, each once.
2. THE Airport_Registry SHALL give each airport a non-empty name and an ARTCC code.
3. THE Airport_Registry SHALL keep the 20 airports of the Legacy_20_List with their existing codes, names and ARTCC codes.
4. THE Airport_Registry SHALL define a display name in `ARTCC_NAMES` for every ARTCC code that an airport uses.
5. THE Airport_Registry SHALL remain the single source for the monitored airport list used by the Poller, the API, the Web_App, the database seed and the tests.

### Requirement 2: Watchlist of 30

**User Story:** As a user, I want to follow up to 30 airports, so that I can watch every airport I care about.

#### Acceptance Criteria

1. THE Watchlist_Cap SHALL equal 30.
2. WHEN a user adds a monitored airport that is not on the Watchlist and the Watchlist holds fewer than 30 airports, THE API SHALL add the airport.
3. WHEN a user adds a monitored airport that is not on the Watchlist and the Watchlist holds 30 airports, THE API SHALL refuse the request with HTTP 409, the error code `watchlist_full` and the Cap_Message "Your Watchlist already has 30 airports. Remove one to add another."
4. WHEN a user adds an airport that is already on a full Watchlist, THE API SHALL report success and leave the Watchlist unchanged.
5. WHEN the Cap_Trigger raises a Cap_Error during an add, THE API SHALL answer with the same HTTP 409 `watchlist_full` response as in criterion 3.
6. THE Web_App SHALL show the Watchlist counter as "N of 30 airports watched", where N is the number of airports on the Watchlist.
7. WHEN the API refuses an add with `watchlist_full`, THE Web_App SHALL show the Cap_Message in the existing error region.

### Requirement 3: Database migration 0006

**User Story:** As the Owner, I want the database to enforce the same cap, so that two simultaneous adds cannot exceed it.

#### Acceptance Criteria

1. THE Migration_0006 SHALL replace the function `enforce_subscription_cap` so that the Cap_Trigger raises a Cap_Error with SQLSTATE 23514 and the message "subscription limit of 30 reached" when a user already has 30 rows in `subscriptions`.
2. THE Migration_0006 SHALL insert the 10 New_Airports into the `airports` table, with `ON CONFLICT ("id") DO NOTHING`.
3. THE Migration_0006 SHALL run in one transaction and be safe to run twice.
4. THE Migration_0006 SHALL have a down file that restores the function with the limit 10 and the message "subscription limit of 10 reached".
5. WHEN a New_Airport is referenced by a row in `subscriptions`, THE down file SHALL leave that airport row in place.
6. THE down file SHALL delete a New_Airport row only when no row in `subscriptions` references the airport.
7. THE Migration_0006 SHALL add a `0006_watchlist_cap_30` entry to `packages/db/migrations/meta/_journal.json`.
8. THE Migration_0006 SHALL not change any other table, column, grant or trigger.
9. WHEN the database applies the Cap_Trigger, THE database SHALL serialize concurrent adds of one user so that the user has at most 30 `subscriptions` rows.
10. THE down file SHALL delete every row of `snapshots` whose `airports` array does not hold exactly 20 entries, so that the previous code can read the table.
11. THE down file SHALL delete every row of `events` whose `airport_id` is one of the New_Airports.
12. THE down file SHALL not delete any row of `subscriptions`, `users` or `alert_log`.

### Requirement 4: Legacy Snapshots keep working

**User Story:** As a user, I want the site to keep working while the Poller catches up after the release, so that no page shows an error.

#### Acceptance Criteria

1. WHEN the API or the Poller reads a Legacy_Snapshot, THE Snapshot repository SHALL return a Snapshot that lists all 30 airports of the Airport_Registry, in sorted order.
2. WHEN the Snapshot repository completes a Legacy_Snapshot, THE Snapshot repository SHALL give each missing airport a `groundStop` of null and keep every stored entry unchanged.
3. WHEN the Poller stores a Snapshot after reading a Legacy_Snapshot, THE Poller SHALL store a Snapshot with 30 airports.
4. WHEN the Poller compares a completed Legacy_Snapshot with the next Snapshot, THE Poller SHALL create no event for a New_Airport that has no ground stop.
5. THE Snapshot schema SHALL require exactly as many unique airports as the Airport_Registry contains.
6. IF a stored Snapshot lists an airport id that is not in the Airport_Registry, THEN THE Snapshot repository SHALL throw a validation error as it does today.

### Requirement 5: New airports in every feature

**User Story:** As a user watching a New_Airport, I want the same plain-language alerts and status as any other airport, so that I do not need a different way to follow it.

#### Acceptance Criteria

1. WHEN the FAA feed lists a ground stop at a New_Airport, THE Poller SHALL store it in the Snapshot and create a ground stop started event for it.
2. WHEN a ground stop at a New_Airport ends, THE Poller SHALL create a ground stop ended event for it.
3. WHEN the FAA feed lists an airport that is not in the Core_30_List, THE Poller SHALL ignore that airport.
4. THE API SHALL list all 30 airports in `GET /api/status/national`, in Airport_Registry order.
5. WHEN a request names a New_Airport in `GET /api/status/airport/:code` or `GET /api/history/:code`, THE API SHALL answer for that airport.
6. WHEN a request names a code outside the Core_30_List, THE API SHALL answer 404 with the error code `airport_not_found`.
7. WHEN an event concerns a New_Airport, THE explanation SHALL name the airport and the ARTCC by their registry names and contain no raw FAA code as the reason.
8. WHEN a ground stop starts or ends at a New_Airport, THE Poller SHALL send alert emails and signed webhooks to the users who watch that airport, by the same rules as for the Legacy_20_List.
9. WHEN the daily digest lists a watched New_Airport, THE Poller SHALL show the airport name and its current status.
10. WHEN a user types a New_Airport code or any part of its name in the Status page search field, THE Web_App SHALL show that airport's row.
11. THE Web_App SHALL show one row for each of the 30 airports in the Status table and in the Watchlist add grid.

### Requirement 6: User-facing copy and docs

**User Story:** As a visitor, I want every page and document to state the real limits, so that nothing says 20 or 10.

#### Acceptance Criteria

1. THE Web_App SHALL show the Status page subtitle "FAA ground stop status for 30 major US airports."
2. THE Web_App SHALL show filter and count text that uses the number of airports in the status response ("All (30)", "Showing N of 30 airports").
3. THE README, `docs/api.md`, `docs/devpost-submission.md`, `docs/kiro-usage.md`, `docs/demo-script.md`, `docs/production-runbook.md`, `docs/responsive-check.md`, and `apps/web/README.md` SHALL state 30 airports and a Watchlist of up to 30 wherever they stated 20 and 10 as current limits.
4. THE documents in criterion 3 SHALL describe only what the code does on the day of the change.
5. THE code comments in `packages/core/src/watchlist.ts`, `packages/db/src/schema.ts`, `packages/db/src/repositories/subscriptions.ts` and `apps/api/src/handlers/status.ts` SHALL state the new limits.
6. THE spec documents under `.kiro/specs/aerobrief/`, `.kiro/specs/aerobrief-phase2/` and `.kiro/specs/ui-refresh/` SHALL stay unchanged, because they record what was specified at the time.

### Requirement 7: Steering files and decision log

**User Story:** As the Owner, I want the steering files to match my decision, so that agents stop refusing work that the limits no longer forbid.

#### Acceptance Criteria

1. THE Scope_Doc SHALL state the Limits as: monitored airports are the Core_30_List, a Watchlist is capped at 30 airports, and history retention is 24 hours only.
2. THE Scope_Doc SHALL state that the Kiroween submission is `main` as of the deadline, December 4, 2026, 2:00 PM PT, and that tag `mvp-contest-2026` stays as the MVP restore point.
3. THE Scope_Doc SHALL not contain the rule that only the contest set may merge into `main` before the deadline, and SHALL not contain the rule that other Phase 2 items stay on `phase-2` until judging has finished.
4. THE Scope_Doc SHALL keep these rules: no scraping and licensed APIs only; billing and any commercial use wait for a review of the FAA data terms and of each provider's license; no passwords (magic links and single sign-on only); no device push notifications, map view, native mobile apps or FAA SWIM; every Phase 2 feature behind its own feature flag, off by default; every schema change a separate reversible migration tested on a Neon branch first; Phase 2 Workers deploy under separate names; the rollback rule; and `main` frozen after the deadline until judging has finished.
5. THE Scope_Doc SHALL keep the Rule "enforce the boundaries", and SHALL name the new limits as the boundaries that apply.
6. THE `product.md` file SHALL replace "20 hardcoded U.S. airports" with "the 30 FAA Core 30 airports".
7. THE steering files `tech.md`, `structure.md` and `design.md` SHALL contain no statement of 20 airports or a Watchlist of 10 after the change.
8. THE Decision_Log SHALL contain a dated section for this decision with the Owner's words "Core 30, watchlist 30, keep the rest.", the old and new limits, the source of the Core_30_List, the rollout order and the rollback steps.

### Requirement 8: Tests

**User Story:** As a maintainer, I want tests that pin the new limits, so that a later change cannot silently break them.

#### Acceptance Criteria

1. THE Airport_Registry test SHALL assert that the registry equals the Core_30_List codes exactly, that the codes are unique, and that every airport has a name, a three-letter code and an ARTCC with a display name.
2. THE tests SHALL assert that the Legacy_20_List is a subset of the Airport_Registry and that the New_Airports are the 10 codes in the Glossary.
3. THE property tests for `applyWatchlistOp` SHALL assert, for any sequence of add and remove operations over monitored and unmonitored ids, that the Watchlist never exceeds 30 airports, has no duplicates, holds only monitored ids, and refuses an add only when the Watchlist holds 30 airports and the id is new.
4. THE API test SHALL assert that the 31st distinct add returns HTTP 409 `watchlist_full` with the Cap_Message of Requirement 2.3.
5. THE database tests SHALL assert that the Cap_Error is mapped to `SubscriptionLimitError` for the messages "subscription limit of 30 reached" and "subscription limit of 10 reached".
6. THE integration test for the Cap_Trigger SHALL assert that concurrent adds of 35 distinct airports leave exactly 30 rows and 5 `SubscriptionLimitError` rejections, and SHALL skip when no test database is configured, as the other integration tests do.
7. THE tests SHALL assert, for any subset of the Airport_Registry, that completing a Legacy_Snapshot yields 30 sorted unique airports, keeps every stored entry, and sets each added entry's `groundStop` to null.
8. THE test for `normalizeResponse` SHALL assert, for any FAA response, that the Snapshot has exactly 30 entries sorted by id, and that a ground stop at a New_Airport appears in its entry.
9. THE test for the SQL text of Migration_0006 SHALL assert that the inserted ids equal the New_Airports, that the function text contains the limit 30 and the message "subscription limit of 30 reached", and that the down file contains the limit 10.
10. THE existing tests that assert 20 airports, 20 table rows or a cap of 10 SHALL assert the Airport_Registry length, 30 rows or the Watchlist_Cap value, and no existing test SHALL be deleted or weakened.
11. THE Web_App tests SHALL assert that the counter shows "of 30 airports watched" and that the Web_App constant for the cap equals `WATCHLIST_CAP` from `@aerobrief/core`.

### Requirement 9: Release order and rollback

**User Story:** As the Owner, I want a safe release order and a rollback, so that production never runs the new code against the old cap in a way that breaks users.

#### Acceptance Criteria

1. WHEN the Owner approves Migration_0006, THE Owner SHALL apply it to the Production_Database in one transaction before pushing `main`.
2. THE release plan SHALL apply Migration_0006 to the Phase2_Branch first, through one transaction, and SHALL verify it there before the Owner is asked to approve it for production.
3. THE release plan SHALL record that Migration_0006 on the Production_Database leaves the old Workers working: the extra airport rows are unused, and the old API still limits a Watchlist to 10 in code.
4. THE `deploy-workers.yml` workflow SHALL deploy the API Worker before the Poller Worker, so that no old API reads a 30-airport Snapshot. THE workflow SHALL stay unchanged.
5. IF the Web_App shows "of 30" while the API still enforces 10, THEN THE Web_App SHALL show the API's Cap_Message through the existing error region and SHALL not crash.
6. THE feature SHALL have no `FEATURE_` flag and SHALL not appear in the feature flag lists of the API, the Poller or the Web_App.
7. IF the release fails, THEN THE Owner SHALL restore the previous behavior with `git revert` of the commit range and the down file of Migration_0006, in that order.
8. THE agent SHALL not commit, push, tag, deploy, or run any migration against the Production_Database.

### Requirement 10: Stack and design constraints

**User Story:** As the Owner, I want the stack and design rules kept, so that this change adds no new risk.

#### Acceptance Criteria

1. THE change SHALL add no runtime dependency and no technology outside `tech.md`.
2. THE change SHALL keep pure logic in `packages/core` and SHALL read no environment variable in `packages/core` or in a component.
3. THE change SHALL not alter the DOM structure of the airport table, the banners, the nav bar or the `aria-live` region, and SHALL change only text content and counts in the Web_App.
4. THE change SHALL leave the nationwide threshold (3 distinct ARTCCs), the 24-hour history and the stale threshold unchanged.
5. THE agent SHALL not read `.env`, `.env.backup` or any `.dev.vars` file.
