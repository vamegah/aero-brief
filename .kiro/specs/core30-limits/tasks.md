# Implementation Plan: Core 30 Airports and Watchlist of 30

## Overview

Change two core product limits (20 airports to the FAA Core 30, watchlist 10 to 30), drop the scope rules that keep finished Phase 2 work out of the Kiroween 2026 submission, and ship `main` before December 4, 2026, 2:00 PM PT. All code is TypeScript (strict). Work happens on branch `phase-2`, after the Status dashboard commit. Order: docs and verification, core package, database, API, poller tests, web, copy sweep, full check, then the owner-gated release (tasks 10 to 13).

**Guardrails for every task.**

- Never read or print `.env`, `.env.backup` or any `.dev.vars` file.
- Do not commit, push, tag or deploy. The owner fast-forwards and pushes `main`.
- Do not edit `.kiro/specs/aerobrief/`, `.kiro/specs/aerobrief-phase2/` or `.kiro/specs/ui-refresh/`. They record what was specified at the time.
- Add no dependency. Change only text and counts in `apps/web`; keep the DOM, class names and colors of the tables, banners, nav bar and `aria-live` region.
- Keep pure logic in `packages/core`. Read no environment variable there.
- No `FEATURE_` flag for this work (design.md, decision 1).
- No migration is run against the production database by an agent. Agents may run `0006` only against the `phase-2` Neon branch (task 10).
- A task marked **needs user action** cannot be done by the agent. Stop and tell the owner the exact step.
- Existing tests change only as listed in `design.md` ("Testing Strategy"). Never delete or weaken a test. Where a test hard-codes 20 or 10, assert `AIRPORTS.length` or `WATCHLIST_CAP`, except in the one test that pins the exact Core 30 list.

## Tasks

- [x] 0. Record the owner's decision in the steering files and the decision log (docs only)
  - [x] 0.1 Edit `.kiro/steering/scope.md`
    - Replace the 20-airport and 10-watchlist Limits with the Core 30 and the watchlist of 30; keep "History retention is 24 hours only."
    - Remove the rule that only the contest set may merge into `main` before the deadline and the rule that other Phase 2 items stay on `phase-2` until judging has finished.
    - State that the Kiroween submission is `main` as of December 4, 2026, 2:00 PM PT and that tag `mvp-contest-2026` stays as the MVP restore point.
    - Keep every rule listed in requirements 7.4 and 7.5. Use the text in `design.md`, section "Steering and docs".
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 0.2 Update the matching wording in the other steering files
    - `.kiro/steering/product.md`: replace "20 hardcoded U.S. airports" with "the 30 FAA Core 30 airports".
    - Search `.kiro/steering/*.md` for "20 airports", "20 hardcoded", "10 airports" and "watchlist.*10". Change only statements of the old limits. `design.md` and `tech.md` hold none today; confirm and leave them unchanged.
    - _Requirements: 7.6, 7.7_

  - [x] 0.3 Record the decision in `docs/decisions.md`
    - Append a section "2026-11-24: Core 30 airports and watchlist of 30" with the owner's words "Core 30, watchlist 30, keep the rest.", the old and new limits, the FAA source URLs from `design.md`, the default that this is not a flagged Phase 2 feature, the release order (migration on production first, then the push), and the rollback (`git revert` of the range, then the down file of `0006`, with the effects listed in `design.md`).
    - Edit no other part of the file.
    - _Requirements: 7.8, 9.1, 9.6, 9.7_

- [x] 1. Verify the list before editing code (read-only)
  - [x] 1.1 Re-check the Core 30 list against the FAA pages
    - Fetch https://www.aspm.faa.gov/aspmhelp/index/ASPM_77.html and https://aspm.faa.gov/aspmhelp/index/OEP_35.html. Confirm the 30 airports marked "Core 30" equal the table in `design.md`. If they differ, stop, correct the table in `design.md`, and tell the owner the difference.
    - _Requirements: 1.1_

  - [x] 1.2 Check the ARTCC codes and the feed codes of the 10 new airports
    - Check each ARTCC in the `design.md` table against an FAA source (for example the FAA air route traffic control center list). Correct the table if a source disagrees.
    - Search `packages/core/test/fixtures/` and `apps/poller/test/` fixtures for the FAA feed's airport id format and confirm it is the three-letter code used for the existing 20 (for example "ATL"). If the format of a New_Airport cannot be confirmed from a fixture, say so in the final report; do not change `normalizeResponse`.
    - _Requirements: 1.2, 1.4, 5.1_

- [x] 2. Core package: airport list, snapshot size, completion step and watchlist cap
  - [x] 2.1 Add the 10 airports to `packages/core/src/airports.ts`
    - Insert the 10 entries from the `design.md` table in alphabetical order by code, and add `ZHN: "Honolulu"` to `ARTCC_NAMES`. Keep the existing 20 unchanged.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 2.2 Remove the literal 20 from `packages/core/src/schemas.ts`
    - Use `AIRPORTS.length` for both the `.length(...)` and the uniqueness check, as in `design.md`.
    - _Requirements: 4.5, 4.6_

  - [x] 2.3 Add `packages/core/src/snapshot-compat.ts` and export it from `index.ts`
    - Implement `completeSnapshotAirports(stored: unknown): unknown` as specified in `design.md`: pass non-arrays through, keep every stored entry, add each missing monitored id with `groundStop: null`, sort by `airportId`.
    - _Requirements: 4.1, 4.2, 4.6_

  - [x] 2.4 Set `WATCHLIST_CAP = 30` in `packages/core/src/watchlist.ts`
    - Update the doc comments ("Cap 30").
    - _Requirements: 2.1_

  - [x] 2.5 Update and extend `packages/core/test/airports.test.ts`
    - Assert the registry equals the 30 Core 30 codes exactly (written out in the test), that codes are unique three-letter strings, that every airport has a non-empty name and an ARTCC that `artccName` knows (not equal to its own code), that the Legacy 20 codes are a subset with their old names and ARTCCs, and that the New_Airports are BWI, CLT, FLL, HNL, IAD, LGA, MDW, PHL, SAN, TPA.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 8.1, 8.2_

  - [x] 2.6 Write property test for the watchlist cap
    - **Property 1: Watchlist cap invariant**
    - Extend `packages/core/test/watchlist-invariants.pbt.test.ts` (and keep the other three watchlist test files passing) so a sequence of adds and removes, mixed with unmonitored ids, keeps the list at most 30, duplicate-free and monitored-only, and refuses an add only for a new monitored id on a full list. Use the existing generators, with at least 100 runs and the tag `// Feature: core30-limits, Property 1: Watchlist cap invariant`.
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 8.3**

  - [x] 2.7 Write property tests for snapshot completion and the schema
    - **Property 3: Completing a Legacy_Snapshot**
    - **Property 4: Schema accepts exactly the full registry**
    - New file `packages/core/test/snapshot-compat.pbt.test.ts`. Generate subsets of `MONITORED_IDS` with random ground stop values. Cover idempotence, kept entries, sorted unique output, `SnapshotSchema` rejecting strict subsets and accepting their completion, and an unknown id still failing after completion.
    - **Validates: Requirements 4.1, 4.2, 4.5, 4.6, 8.7**

  - [x] 2.8 Update normalization tests and write the normalization property test
    - **Property 5: Normalization covers the registry and keeps stops**
    - In `normalize.test.ts`, `normalize.pbt.test.ts` and `schemas.test.ts` replace `20` with `AIRPORTS.length` and the title "exactly the 20 monitored airports" with "the monitored airports". Make the property generator include New_Airports and foreign ids. In `arbitraries.ts` change the comments that say 20.
    - **Validates: Requirements 5.1, 5.3, 8.8, 8.10**

  - [x] 2.9 Write property test for change detection with the new airports
    - **Property 6: Legacy-to-new transition creates no false events, and real changes are detected**
    - New file `packages/core/test/change-detector-new-airports.pbt.test.ts`. Build snapshots from `AIRPORTS` with random stops, drop the New_Airports, complete, and diff. Also assert one started and one ended event for any monitored airport.
    - **Validates: Requirements 4.4, 5.1, 5.2**

  - [x] 2.10 Write property test for explanations
    - **Property 7: Explanations name the airport and show no raw reason**
    - New file `packages/core/test/explain-airports.pbt.test.ts`. Generate any monitored id and any reason string or null; check the name and code are present and the unknown-reason ending.
    - **Validates: Requirements 5.7**

- [x] 3. Checkpoint - core package
  - Run the core package tests and the repo typecheck. Ensure all tests pass, ask the user if questions arise.

- [x] 4. Database package: migration 0006, snapshot completion and the cap error
  - [x] 4.1 Create `0006_watchlist_cap_30.sql`, its down file and the journal entry
    - `packages/db/migrations/0006_watchlist_cap_30.sql` and `packages/db/migrations/down/0006_watchlist_cap_30.down.sql` as written in `design.md`. Generate the 10 insert rows with `renderAirportsInsertSql` over the New_Airports so the values equal `airports.ts`. Add the journal entry with idx 6.
    - Do not run either file anywhere in this task.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.10, 3.11, 3.12_

  - [x] 4.2 Complete Legacy_Snapshots in `packages/db/src/repositories/snapshots.ts`
    - Call `completeSnapshotAirports(row.airports)` before `SnapshotSchema.parse`, and update the comment on `latestSnapshot`.
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 4.3 Update the cap error text and comments
    - `packages/db/src/repositories/subscriptions.ts`: message "subscription limit of 30 reached", comments "31st airport"; leave `isSubscriptionLimitError` matching on "subscription limit". `packages/db/src/schema.ts`: comment "cap of 30 ... migration 0006".
    - _Requirements: 2.5, 6.5_

  - [x] 4.4 Write database unit tests
    - **Property 2: Cap_Error recognition**
    - New `packages/db/test/subscription-limit.pbt.test.ts` for Property 2 (any number in the message, any depth up to 5, wrong code or text returns false).
    - New `packages/db/test/migration-0006.test.ts`: read the two SQL files as text; assert the inserted ids equal the New_Airports computed from `AIRPORTS` minus the Legacy 20 codes (written out in the test), the function text has `>= 30` and "subscription limit of 30 reached" and `ERRCODE = '23514'`, the file uses `ON CONFLICT ("id") DO NOTHING`, the down file has `>= 10`, `jsonb_array_length("airports") <> 20`, the `NOT EXISTS` guard on `subscriptions`, and no `DELETE FROM "subscriptions"`, `"users"` or `"alert_log"`; and the journal has the `0006_watchlist_cap_30` entry.
    - Update `schema.test.ts` (`toHaveLength(AIRPORTS.length)`) and `auth-repositories.test.ts` (messages for 30 and the old 10). Add a repository test with a fake Db returning a 20-airport stored row and asserting a 30-entry Snapshot.
    - **Validates: Requirements 2.5, 3.2, 3.4, 3.5, 3.6, 3.7, 3.10, 3.11, 3.12, 4.1, 4.3, 8.5, 8.9**

  - [x] 4.5 Update the opt-in integration test
    - `packages/db/test/integration/watchlist-cap.test.ts`: 35 concurrent adds leave 30 rows, 30 fulfilled, 5 `SubscriptionLimitError`; sequential: the 31st add is rejected and a repeat add of a present airport returns false. Update the comment (Requirement 8.8 of the original spec, now 30). Keep `describe.skipIf(!hasTestDb)`. Check that `test-db.ts` `seededAirportIds` reads the `airports` table (so it returns 30 after `0006`).
    - _Requirements: 3.9, 8.6_

- [x] 5. API: the cap message and its tests
  - [x] 5.1 Build the `watchlist_full` message from `WATCHLIST_CAP`
    - `apps/api/src/handlers/watchlist.ts`: import `WATCHLIST_CAP` from `@aerobrief/core` and build "Your Watchlist already has 30 airports. Remove one to add another." from it. Update the comment in `apps/api/src/handlers/status.ts` ("all 30 airports").
    - _Requirements: 2.3, 2.5, 6.5_

  - [x] 5.2 Update and add API tests
    - `apps/api/test/watchlist.test.ts`: the 31st distinct add returns 409 `watchlist_full` with the exact 30 message; an add of a present airport at 30 succeeds; a `SubscriptionLimitError` from the repository returns the same 409.
    - `apps/api/test/status.test.ts` and `nationwide-status.pbt.test.ts`: 30 airports. Add an example for `GET /api/status/airport/:code` and `GET /api/history/:code` for each New_Airport and 404 `airport_not_found` for a code outside the list (for example "CLE").
    - _Requirements: 2.3, 2.4, 2.5, 5.4, 5.5, 5.6, 8.4_

- [x] 6. Poller: tests only
  - [x] 6.1 Update `apps/poller/test/poll.test.ts` and add the legacy case
    - Replace `toHaveLength(20)` with `AIRPORTS.length`. Add a case where the fake `latestSnapshot` returns a completed 20-airport Snapshot and the stored Snapshot has 30 entries and no event for a New_Airport without a ground stop. Add a case with a ground stop at a New_Airport that stores one started event.
    - _Requirements: 4.3, 4.4, 5.1, 5.2, 5.3_

  - [x] 6.2 Add New_Airport examples to the notifier, webhook and digest tests
    - One example each in `notifier.test.ts`, `webhooks.test.ts` and `digest.test.ts` using a New_Airport (for example "LGA"): the alert, the signed webhook payload and the digest line carry the registry name and the plain-language explanation.
    - _Requirements: 5.7, 5.8, 5.9_

- [x] 7. Web app: counter, subtitle and tests
  - [x] 7.1 Change the text and counts in `apps/web`
    - `src/pages/WatchlistPage.tsx`: `MAX_WATCHLIST = 30`. `src/pages/StatusPage.tsx`: subtitle "FAA ground stop status for 30 major US airports." `src/components/WatchlistTable.tsx`: comment says 30. No DOM, class or color change.
    - _Requirements: 2.6, 2.7, 5.11, 6.1, 6.2, 10.3_

  - [x] 7.2 Update and add web tests
    - Replace the hard-coded 20 in `components/airport-search.test.tsx`, `airport-filter.test.tsx`, `status-view.test.tsx` and `status-page.test.tsx` with the registry length; build any hand-made 20-entry fixture from `AIRPORTS`. "All (30)" and "Showing 30 of 30 airports".
    - Add: the Watchlist counter reads "0 of 30", "1 of 30" and "30 of 30 airports watched"; a 409 `watchlist_full` response shows its message in the error region and keeps the page rendered; the subtitle text; `MAX_WATCHLIST` equals `WATCHLIST_CAP` (export `MAX_WATCHLIST` from the page module only if the test cannot reach it otherwise, and say so in the report); `matchesAirportSearch` finds each New_Airport by its code and by a name fragment ("honolulu", "midway", "laguardia").
    - Run the existing vitest-axe and layout tests unchanged.
    - _Requirements: 2.6, 2.7, 5.10, 5.11, 6.1, 6.2, 8.10, 8.11, 9.5_

- [x] 8. Copy and docs sweep
  - [x] 8.1 Update the README files
    - `README.md`: "The 30 FAA Core 30 airports are monitored (`packages/core/src/airports.ts`)", "A watchlist holds at most 30 airports", and the line about the seed that says 20 airports and migration `0002` (now `0002` and `0006`). `apps/web/README.md` if it states a limit.
    - _Requirements: 6.3, 6.4_

  - [x] 8.2 Update the docs
    - `docs/api.md` (the limits line, the endpoint table, "trimmed to 2 of the 30", "Always 30 items", the 404 text), `docs/devpost-submission.md` (dashboard bullet, "All (30)", "Follow up to 30 of the 30 airports", "up to 30"), `docs/demo-script.md` (20 rows, "twenty major US airports", "The limit is ten", the description line), `docs/kiro-usage.md` (the scope table row and the "N of 10" mention: add a line that the limits changed on 2026-11-24 and link to `docs/decisions.md`; do not rewrite history sentences), `docs/production-runbook.md` ("20 airport rows", the seeded count note), `docs/responsive-check.md` (20 rows).
    - Describe only what the code does. Do not claim a live check that has not happened (task 13).
    - _Requirements: 6.3, 6.4_

  - [x] 8.3 Sweep for leftover old limits
    - Search `README.md`, `docs/`, `apps/*/src`, `packages/*/src`, `apps/*/test`, `packages/*/test`, `tests/` and `.kiro/steering/` for "20 airports", "20 major", "twenty", "of 20", "toHaveLength(20)", "All (20)", "of 10", "10 airports", "up to 10", "limit of 10" and "cap of 10". Each hit is either changed or is a legitimate other use (for example the 10-minute stale threshold, the 10-second timeout, the `subscription limit of 10 reached` negative cases in tests, `.kiro/specs/aerobrief*` and `ui-refresh` records). List the kept hits in the final report.
    - _Requirements: 6.3, 6.5, 6.6, 7.7_

- [-] 9. Checkpoint - full local check
  - Run the repo's typecheck, the full unit and property test run (single run, not watch mode), and the web build. Confirm the opt-in integration tests skip without a database URL. Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Apply 0006 to the phase-2 Neon branch and verify it there
  - [~] 10.1 Apply `0006_watchlist_cap_30.sql` to the `phase-2` branch
    - Use the Neon MCP `run_sql_transaction` with the file's statements split at the `--> statement-breakpoint` lines, in one transaction, on the `phase-2` branch only. Confirm the project and branch ids against `docs/decisions.md` first; if the target is not the `phase-2` branch, stop and ask.
    - Check read-only afterwards: `SELECT count(*) FROM airports` is 30, the 10 new ids exist, `pg_get_functiondef('enforce_subscription_cap'::regproc)` shows 30 and the new message, the trigger still exists on `subscriptions`.
    - Append one dated line to `docs/decisions.md` in the style of the 0004 line ("Migration 0006 applied to branch phase-2 via Neon MCP run_sql_transaction").
    - _Requirements: 3.3, 9.2_

  - [~] 10.2 Run the integration test against the phase-2 branch
    - Run `packages/db/test/integration/watchlist-cap.test.ts` with the repo's documented opt-in test database variable pointing at the `phase-2` branch (the existing `phase2-target` guard refuses other hosts). Never print the connection string. If the variable is not set, say so and mark this sub-task as needing the owner.
    - _Requirements: 3.9, 8.6, 9.2_

- [ ] 11. Apply 0006 to production (needs user action, owner approval, before the push)
  - [~] 11.1 Take a restore point
    - **Needs user action.** The owner creates a Neon snapshot or a child branch of the production branch and confirms it exists, as `docs/phase2-rollout.md` step 3a describes.
    - _Requirements: 9.1, 9.8_

  - [~] 11.2 Apply the migration
    - **Needs user action.** The owner approves and runs `0006_watchlist_cap_30.sql` on the production database in one transaction that stops on the first error (the method in `docs/phase2-rollout.md` step 3c). Production has no `__drizzle_migrations` table, so do not use `drizzle-kit migrate`. The agent prepares the exact command text in the report and runs nothing.
    - _Requirements: 9.1, 9.3, 9.8_

  - [~] 11.3 Check the result with read-only queries
    - **Needs user action.** The owner (or the agent through read-only Neon queries, if the owner allows it) checks: 30 rows in `airports`, the function text, the trigger present. The site still behaves as before until the push.
    - _Requirements: 9.1, 9.3_

- [ ] 12. Ship (needs user action, owner only)
  - [~] 12.1 Fast-forward `main` and push before December 4, 2026, 2:00 PM PT
    - **Needs user action.** After tasks 9 and 11 are done, the owner fast-forwards `main` from `phase-2` (the Status dashboard and this work included) and pushes. The push deploys the API Worker, then the Poller Worker (`deploy-workers.yml`), and Vercel deploys the web app. Watch the Actions run finish.
    - _Requirements: 9.1, 9.4, 9.8_

- [ ] 13. Final owner check on the live site (needs user action)
  - [~] 13.1 Check https://www.aerobriefs.com
    - **Needs user action.** Within about 10 minutes of the push: the Status page shows 30 rows and the subtitle "30 major US airports"; search "honolulu" and "LGA" each find one row; `capturedAt` is newer than the push time and `stale` is false (`/api/status/national`); sign in, open the Watchlist, the counter reads "N of 30 airports watched"; add airports up to 30 if desired and confirm the 31st add shows "Your Watchlist already has 30 airports. Remove one to add another."
    - If anything fails, follow the rollback in `design.md` ("Release order") and `docs/decisions.md`.
    - _Requirements: 2.3, 2.6, 5.4, 5.10, 5.11, 6.1, 9.7_

## Notes

- No test sub-task is marked optional, because the owner asked for tests with each change.
- Tasks 11 to 13 cannot be done by an agent. The agent stops after task 10 and reports.
- Decision defaults are in `design.md`: no feature flag, FAA-style names, ARTCC codes checked in task 1.2, nationwide threshold unchanged.
- Release order is fixed: the production migration first (task 11), then the push (task 12). Applying them in the other order would show the new counter with the old trigger.
- Rollback: `git revert` of the range, push, then the down file of `0006` in one transaction with the owner's approval. The down file also deletes the stored 30-airport Snapshots and the last 24 hours of events for the 10 new airports, so the dashboard shows "no data" for up to 5 minutes.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["0.1", "0.2", "0.3", "1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.4"] },
    { "id": 3, "tasks": ["2.3"] },
    { "id": 4, "tasks": ["2.5", "2.6", "2.7", "2.8", "2.9", "2.10"] },
    { "id": 5, "tasks": ["3"] },
    { "id": 6, "tasks": ["4.1", "4.2", "4.3", "5.1", "7.1"] },
    { "id": 7, "tasks": ["4.4", "4.5", "5.2", "6.1", "6.2", "7.2"] },
    { "id": 8, "tasks": ["8.1", "8.2"] },
    { "id": 9, "tasks": ["8.3"] },
    { "id": 10, "tasks": ["9"] },
    { "id": 11, "tasks": ["10.1"] },
    { "id": 12, "tasks": ["10.2"] },
    { "id": 13, "tasks": ["11.1"] },
    { "id": 14, "tasks": ["11.2"] },
    { "id": 15, "tasks": ["11.3"] },
    { "id": 16, "tasks": ["12.1"] },
    { "id": 17, "tasks": ["13.1"] }
  ]
}
```
