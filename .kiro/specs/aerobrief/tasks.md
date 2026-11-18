# Implementation Plan: AeroBrief

## Overview

Tasks are ordered by dependency, backend first: repo scaffolding and the pure core package, then the database schema, then the three BLOCKING backend components (Poller, Change_Detector, alert engine/Notifier), then a gate checkpoint, then the API, then the frontend, then the accessibility gate and final CI.

All code is TypeScript with `"strict": true`. Stack is fixed by workspace steering. Scope is fixed by the MVP scope rules: 20 hardcoded airports, watchlist cap of 10, 24-hour history. No maps, push notifications, FAA SWIM, passwords, scraping, monetization, or native apps appear in any task.

**BLOCKING gate.** Tasks 4 (Poller), 5 (Change_Detector) and 6 (alert engine/Notifier) are BLOCKING. No task that creates or modifies anything under `apps/web` may start until Tasks 4, 5 and 6 are complete and Task 7 (the gate checkpoint) has passed. The frontend tasks (Task 10 onward) also depend on the API (Task 8) being complete.

**Approvals pending.** Zod, vitest-axe, jsdom and @testing-library/react are outside the steering stack and are pending user approval (see design.md, Stack Deviations). Task 1.1 confirms approval before anything is installed. Hono is NOT approved and MUST NOT be used. The API uses the hand-written router specified in the design.

## Tasks

- [x] 1. Repository scaffolding and approval gate
  - [x] 1.1 Confirm deviation approvals before installing anything
    - Ask the user with the user_input tool whether Zod (runtime) is approved. Ask separately whether vitest-axe, jsdom and @testing-library/react (dev-only) are approved.
    - Record each answer in `docs/decisions.md` (create it), with the date and the fallback taken.
    - Zod fallback if declined: implement `parseFaaResponse`, `parseFaaBody` and `SnapshotSchema` parsing in Task 2.2 as hand-written validators and type guards behind the same function signatures. Do not install Zod. The downstream tasks do not change.
    - Accessibility tools fallback if declined: do NOT silently drop Requirement 13.6. Stop and report to the user that 13.6 cannot be met automatically, and ask how to proceed before Task 10.1 and Task 11.
    - Hono is not approved. Do not install it. Do not ask for it again.
    - Task 2.2 must not start until the Zod answer is recorded. Task 10.1 must not install the accessibility tools until their answer is recorded.
    - _Requirements: 14.1, 14.3, 14.6_

  - [x] 1.2 Create the npm workspaces monorepo
    - Create root `package.json` (workspaces), `tsconfig.base.json` with `"strict": true`, and per-workspace tsconfigs extending it, for `packages/core`, `packages/db`, `apps/poller` and `apps/api`.
    - Do NOT create `apps/web` here. It is created in Task 10.1, after the BLOCKING gate.
    - Add Vitest and fast-check as dev dependencies, and a root `vitest.config.ts` (TypeScript).
    - Add `.gitignore` covering `node_modules`, build output, `.dev.vars` and `.env*` so secrets are never committed.
    - Add `typecheck` and `test` (`vitest --run`) root scripts.
    - _Requirements: 14.1, 14.2, 14.6, 14.10_

  - [x] 1.3 Add the repo guard test
    - Add a Vitest test `tests/repo-guard.test.ts` that fails if any `.js`, `.jsx`, `.mjs` or `.cjs` source file exists outside `node_modules` and build output, or if any `tsconfig*.json` lacks `"strict": true` (directly or via `extends`).
    - Add a check that no dependency or source in the repo imports `hono`, and that no schema column is named like a password.
    - _Requirements: 14.1, 14.8_

  - [x] 1.4 Create the baseline GitHub Actions workflow
    - Create `.github/workflows/ci.yml` triggered on `pull_request` (opened, synchronize, reopened) with jobs for install, `tsc --noEmit` per workspace, and `vitest --run` (covers unit, fast-check and the repo guard).
    - Any failing job must fail the pull request check.
    - The accessibility job is added in Task 11.2.
    - _Requirements: 14.7, 14.11_

- [x] 2. Core package foundations (pure, no I/O)
  - [x] 2.1 Define the 20 Monitored_Airports
    - Create `packages/core/src/airports.ts` with the readonly tuple of 20 airports (id, full name, ARTCC) from the design's Monitored Airports table, and the ARTCC display-name map.
    - Export `MONITORED_IDS`, `MonitoredId`, and lookup helpers.
    - _Requirements: 2.6, 14.12_

  - [x] 2.2 Implement FAA and Snapshot schemas and body parsing
    - Create `packages/core/src/schemas.ts` with `FaaResponseSchema`, `GroundStopInfoSchema`, `AirportStatusSchema`, `SnapshotSchema`, and `parseFaaBody(text)` that never throws and returns kind `unparseable`, `validation`, or the parsed response.
    - Use Zod if approved in 1.1, otherwise the hand-written fallback behind the same signatures.
    - Unknown FAA keys are stripped. A valid empty array is accepted. None of the `groundStop` inner fields is required.
    - _Requirements: 1.6, 2.1, 2.3, 2.4_

  - [x] 2.3 Implement normalization and FAA_Event_ID derivation
    - Create `packages/core/src/normalize.ts` with `normalizeResponse(faa, capturedAt, id, previous)`: filter to monitored ids, merge duplicates deterministically, fill omitted airports with `groundStop: null`, sort by `airportId`, and produce exactly 20 entries.
    - Create `deriveFaaEventId(airportId, groundStop, capturedAt, previousEntry)` with the three rules (`faa:`, `start:`, `seen:`) and carry-forward of a `first_seen` id.
    - _Requirements: 2.2, 2.4, 2.5, 2.8, 9.10_

  - [x] 2.4 Implement time rules
    - Create `packages/core/src/time.ts` with `isStale` (elapsed strictly greater than 600 000 ms) and `withinRetention` (age at most 86 400 000 ms), both taking `now` as an argument.
    - _Requirements: 6.2, 6.3, 11.1, 11.2, 11.3_

  - [x] 2.5 Implement the secret-safe logger
    - Create `packages/core/src/logger.ts`, a wrapper that never serializes `env` objects or request headers, and redacts known secret values.
    - _Requirements: 14.10_

  - [x] 2.6 Write unit tests for airports and schemas
    - Assert 20 unique ids, each with a name and ARTCC, and 18 distinct ARTCCs.
    - Parse `fixtures/airport-events-live.json` (create it from the shape recorded in design.md, FAA Payload Findings) and a populated `groundStop` fixture built from the FAA schema, with `id`, with `startTime` only, and with neither.
    - Assert each fixture yields the expected FAA_Event_ID.
    - _Requirements: 2.1, 2.4, 2.6, 9.10, 14.12_

  - [x] 2.7 Create shared fast-check arbitraries
    - Create `packages/core/test/arbitraries.ts`: a Snapshot arbitrary over the 20 ids, a partial-subset Snapshot variant, a FAA response arbitrary (monitored ids, foreign ids, duplicates, nulls, unknown extra keys), a generic string arbitrary, and ground stop arbitraries (id string, number and blank; no id with and without a valid or unparseable `startTime`; multi-Snapshot sequences).
    - _Requirements: 2.2, 3.1, 9.10_

  - [x] 2.8 Write property test for FAA body classification
    - **Property 1: FAA body classification**
    - Tag: `// Feature: aerobrief, Property 1: FAA body classification`
    - **Validates: Requirements 1.6, 2.3**

  - [x] 2.9 Write property test for normalization
    - **Property 2: Normalization yields exactly the 20 monitored airports**
    - **Validates: Requirements 2.2, 2.4, 2.5**

  - [x] 2.10 Write property test for the Snapshot JSON round trip
    - **Property 3: Snapshot JSON round trip**
    - **Validates: Requirements 2.8**

  - [x] 2.11 Write property test for FAA_Event_ID derivation
    - **Property 33: FAA_Event_ID derivation**
    - **Validates: Requirements 9.10**

  - [x] 2.12 Write property test for the retention partition
    - **Property 29: Retention partition**
    - **Validates: Requirements 11.1, 11.2, 11.3**

  - [x] 2.13 Write property test for the age bound after cleanup
    - **Property 30: Age bound after cleanup**
    - **Validates: Requirements 11.5**

  - [x] 2.14 Write property test for secrets never reaching logs
    - **Property 32: Secrets never reach logs**
    - **Validates: Requirements 14.10**

- [x] 3. Database schema and repositories
  - [x] 3.1 Define the Drizzle schema, migration and seed
    - In `packages/db`, define all ten tables from the design's Data Models: `airports`, `snapshots`, `events`, `subscriptions`, `alert_log`, `users`, `sessions`, `magic_links`, `job_runs`, `poller_lease`. All timestamps `timestamptz(3)`.
    - Include `unique(event_key, type)` on `events`, `unique(event_key, event_type, user_id)` on `alert_log`, cascades from `users`, and no password column anywhere.
    - Generate the migration with Drizzle Kit. Add the `enforce_subscription_cap` trigger (row lock on `users`, raise at 10 entries) and a migration step that seeds `airports` from `packages/core/src/airports.ts`.
    - Document the SELECT-only runtime role for `airports` in the migration.
    - _Requirements: 2.6, 7.6, 7.7, 8.8, 9.10, 11.1, 14.3_

  - [x] 3.2 Implement poller-side repositories
    - Create repositories for snapshots, events, job runs, the poller lease, and cleanup, using `@neondatabase/serverless` with the `neon-http` driver.
    - Every method takes `now`. Snapshot and Event reads add `captured_at >= now - 24h`. Multi-statement writes use `db.batch`.
    - Cleanup is one batch: Snapshots, Events and job runs older than 24 h, `alert_log` older than 48 h, expired Sessions and Magic_Links.
    - Events are inserted with `ON CONFLICT (event_key, type) DO NOTHING RETURNING`.
    - _Requirements: 1.5, 1.7, 2.7, 11.1, 11.2, 11.3, 11.6_

  - [x] 3.3 Implement auth, watchlist and alert repositories
    - Create repositories for users, sessions, Magic_Links (hashed tokens, atomic redeem `UPDATE ... RETURNING`), subscriptions (cap error mapped to a typed error), account deletion (single `DELETE FROM users`), and `alert_log` (bulk claim with `ON CONFLICT DO NOTHING RETURNING`, outcome and latency update).
    - _Requirements: 7.3, 7.6, 8.9, 8.10, 9.4, 9.10, 12.5_

  - [x] 3.4 Write unit tests for the schema
    - Assert seed rows equal the core airport list, the schema has no password column, and both unique constraints exist.
    - _Requirements: 2.6, 7.7, 9.10_

  - [x] 3.5 Write integration tests against a test Neon branch
    - Atomic Snapshot plus Events batch (forced failure leaves zero rows), poller lease (two concurrent acquisitions, one wins), concurrent Magic_Link redeem (one success), watchlist cap trigger under concurrent adds never exceeds 10, account deletion cascade and rollback, cleanup batch failure leaves all rows.
    - Skip when no test database URL is configured.
    - _Requirements: 1.7, 2.7, 7.3, 8.8, 8.10, 11.6_

- [x] 4. BLOCKING: Implement the Poller
  - [x] 4.1 Scaffold the Poller Worker
    - Create `apps/poller` with `wrangler.toml` crons `*/5 * * * *` (poll) and `*/30 * * * *` (cleanup), and a `scheduled(controller, env)` dispatcher on `controller.cron`.
    - Placeholder poll and cleanup handlers are replaced in Tasks 4.3 and 4.4. Secrets (`DATABASE_URL`, `RESEND_API_KEY`, `UNSUBSCRIBE_SECRET`) are read from the Worker `env`, never committed.
    - _Requirements: 1.1, 11.4, 14.2, 14.10_

  - [x] 4.2 Implement the FAA client
    - Fetch only the FAA_API URL with `AbortSignal.timeout(10_000)`.
    - Classify failures as `timeout`, `http_status` (status in detail), `unparseable` or `validation` using `parseFaaBody`.
    - Make no request to any other host.
    - _Requirements: 1.2, 1.3, 1.4, 1.6, 2.1, 2.3, 14.9_

  - [x] 4.3 Implement the poll cycle (ingest and store)
    - Acquire the lease, skip silently if held, fetch, normalize against the previous Snapshot, and store the Snapshot plus a success `job_run` in one batch. Release the lease in `finally`.
    - On any failure, record a failed `job_run` with kind and detail within 5 seconds, and leave Snapshots unchanged. Storage failure leaves no partial Snapshot.
    - Wire the handler into the dispatcher from 4.1.
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 2.2, 2.3, 2.7_

  - [x] 4.4 Implement the cleanup job
    - Run the repository cleanup batch from the `*/30` cron. On failure, record the failure, change nothing, and rely on the next scheduled run.
    - Wire the handler into the dispatcher.
    - _Requirements: 11.2, 11.4, 11.6_

  - [x] 4.5 Write unit tests for the Poller
    - With mocked `fetch` and repositories: timeout, non-2xx, unparseable and validation failures each record a failed `job_run` and write no Snapshot. Only the FAA URL is requested. Overlapping run is skipped. Storage failure leaves no Snapshot.
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.3, 2.7_

- [x] 5. BLOCKING: Implement the Change_Detector and event pipeline (pure core)
  - [x] 5.1 Implement `detectChanges` and nationwide status
    - In `packages/core`, define the `DetectedEvent` types, `affectedArtccs`, `nationwideStatus`, and `detectChanges(current, previous)` following the Change_Detector rules: per-airport transitions over the union of airports, a null `previous` as all inactive, ascending airport order, at most one NATIONWIDE_EVENT last when `count(current) >= 3 && !(previous && count(previous) >= 3)`.
    - The function is pure and does not mutate its inputs.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.8, 3.9, 3.10, 4.1, 4.2, 4.3, 4.6_

  - [x] 5.2 Implement the Explanation_Mapper
    - Create `explain(e)` backed by a registry typed `Record<DetectedEvent["type"], (e) => string>`, the three templates, the reason dictionary (lower-cased, trimmed exact match), the 6-center cap for NATIONWIDE, and `UnsupportedEventTypeError` for unknown types.
    - Every airport and ARTCC code in the text follows its plain-language name.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.9, 5.10_

  - [x] 5.3 Implement event keys
    - Create `eventKey(e, previousSnapshotId)` (ground stop: `faaEventId`; nationwide: `NATIONWIDE:{previousSnapshotId or "none"}`) and `dedupKey(e, previousSnapshotId, userId)`.
    - _Requirements: 9.9, 9.10_

  - [x] 5.4 Write property test for purity and determinism
    - **Property 4: Change detection is pure and deterministic**
    - **Validates: Requirements 3.1**

  - [x] 5.5 Write property test for the per-airport transition rule
    - **Property 5: Per-airport transition rule**
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.8**

  - [x] 5.6 Write property test for missing data
    - **Property 6: Missing data is treated as inactive**
    - **Validates: Requirements 3.5, 3.9**

  - [x] 5.7 Write property test for self-comparison
    - **Property 7: Change detection against itself is empty**
    - **Validates: Requirements 3.6**

  - [x] 5.8 Write property test for started minus ended
    - **Property 8: Started minus ended equals the change in active count**
    - **Validates: Requirements 3.7**

  - [x] 5.9 Write property test for ordering and uniqueness
    - **Property 9: Event ordering and uniqueness**
    - **Validates: Requirements 3.10**

  - [x] 5.10 Write property test for nationwide emission
    - **Property 10: Nationwide emission**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.6**

  - [x] 5.11 Write property test for nationwide monotonicity
    - **Property 12: Nationwide status is monotonic**
    - **Validates: Requirements 4.7**

  - [x] 5.12 Write property test for explanation content and form
    - **Property 13: Explanation content and form**
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.9**

  - [x] 5.13 Write property test for cause text
    - **Property 14: Cause text**
    - **Validates: Requirements 5.5, 5.6, 5.7**

  - [x] 5.14 Write property test for unsupported event types
    - **Property 15: Unsupported event types are rejected**
    - **Validates: Requirements 5.10**

  - [x] 5.15 Write property test for one template per Event type
    - **Property 35: One user-facing template per Event type**
    - **Validates: Requirements 5.1**

  - [x] 5.16 Write unit tests for the detector and explanations
    - Example cases: first poll with no previous Snapshot, flapping airport, exactly 2 and 3 Affected_ARTCCs, two airports in one ARTCC counted once, explanation for an unknown reason.
    - _Requirements: 3.5, 4.1, 4.2, 5.6, 5.7_

- [x] 6. BLOCKING: Implement the alert engine (Notifier)
  - [x] 6.1 Implement the Resend client
    - Create a small shared workspace `packages/mail` (layout addition so the Poller and the API share one client): `sendEmail` via `fetch` to `https://api.resend.com/emails`, 10 s timeout, up to 3 attempts with 1 s and 2 s backoff, and an `Idempotency-Key` header equal to `sha256(event_key:event_type:user_id)`. Inject `fetch` for testability.
    - No Resend SDK. Confirm the header name against Resend's documentation while implementing.
    - _Requirements: 9.3, 9.5, 14.5_

  - [x] 6.2 Implement alert email composition and the unsubscribe signature
    - Compose the plain-text and HTML-escaped bodies with the airport name, Event type, Explanation verbatim, and the time as `YYYY-MM-DD HH:mm UTC`.
    - For ground stop Events, add the unsubscribe link `FRONTEND_URL/unsubscribe?u=&a=&sig=` with `sig = base64url(HMAC-SHA256(UNSUBSCRIBE_SECRET, userId + "." + airportId))`. Implement sign and constant-time verify in `packages/core`.
    - _Requirements: 5.8, 9.2, 9.8_

  - [x] 6.3 Implement the Notifier orchestration
    - Skip all sends when the latest stored Snapshot is stale, and re-check before each retry. Select recipients (watchers of the airport, or users with at least one airport for NATIONWIDE, never users with zero airports). Claim `alert_log` rows with `ON CONFLICT DO NOTHING RETURNING`, send with concurrency 10, and record one final outcome per (event, user): `handed_off` or `failed`.
    - Record `latency_ms = acceptedAt - storedAt`. If the latency write fails, keep the email result and emit a structured `latency_record_failed` error.
    - _Requirements: 6.8, 9.1, 9.4, 9.5, 9.6, 9.7, 9.9, 9.10, 12.4, 12.5, 12.7_

  - [x] 6.4 Wire detection and notification into the poll cycle
    - In the poll cycle (`apps/poller`), after normalization call `detectChanges`, `explain` and `eventKey`. Store the Snapshot, the Events (`ON CONFLICT (event_key, type) DO NOTHING RETURNING`) and the success `job_run` in one `db.batch`. Set `storedAt` right after the batch commits.
    - Pass only newly inserted Events to the Notifier.
    - _Requirements: 3.8, 9.1, 9.3, 9.9, 9.10, 12.4_

  - [x] 6.5 Write property test for alert email content
    - **Property 17: Alert email content**
    - **Validates: Requirements 5.8, 9.2, 9.8**

  - [x] 6.6 Write property test for recipient selection
    - **Property 24: Alert recipient selection**
    - **Validates: Requirements 9.1, 9.4, 9.6, 9.7**

  - [x] 6.7 Write property test for retry bound and final outcome
    - **Property 25: Retry bound and final outcome**
    - **Validates: Requirements 9.5**

  - [x] 6.8 Write property test for the unsubscribe signature
    - **Property 26: Unsubscribe signature**
    - **Validates: Requirements 9.8**

  - [x] 6.9 Write property test for reprocessing events
    - **Property 27: Reprocessing events sends at most one email per user per event**
    - **Validates: Requirements 9.9, 9.10**

  - [x] 6.10 Write property test for snapshot-independent event keys and dedup
    - **Property 34: Event key and alert dedup are independent of the Snapshot**
    - **Validates: Requirements 9.9, 9.10**

  - [x] 6.11 Write property test for the staleness threshold and send gate
    - **Property 16: Staleness threshold and send gate**
    - Cover `isStale` and the Notifier gate here. The API `stale` flag assertion is covered in Task 8.15.
    - **Validates: Requirements 6.2, 6.3, 6.8**

  - [x] 6.12 Write unit tests for the Notifier
    - The Resend `Idempotency-Key` is identical across attempts and across runs for the same triple. A retried poll that re-detects an existing FAA_Event_ID inserts no Event and sends no email. STARTED then ENDED for one FAA_Event_ID sends two emails. Latency-write failure still delivers the email.
    - _Requirements: 9.5, 9.9, 9.10, 12.7_

- [x] 7. Checkpoint - BLOCKING GATE: backend core complete
  - Gate rule: Tasks 4 (Poller), 5 (Change_Detector) and 6 (alert engine/Notifier) must ALL be complete, and all tests passing, before any task that creates or modifies `apps/web` may start. The API (Task 8) may start after this gate.
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement the API (hand-written router, no Hono)
  - [x] 8.1 Implement pure account and watchlist logic
    - In `packages/core`: `validateEmail` (trim, lower-case, syntactically valid, at most 254 characters), `classifyMagicLink` (15-minute expiry), `isRateLimited` (5 or more in the preceding 60 minutes), and `applyWatchlistOp` (cap 10, monitored ids only, idempotent add and remove).
    - _Requirements: 7.1, 7.2, 7.4, 7.5, 7.8, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.8_

  - [x] 8.2 Implement the hand-written router
    - In `apps/api`, define `Route`, `Handler`, `RouteContext` and `createFetchHandler(routes)` on the Workers `fetch` handler. Apply Session, Origin and JSON checks from `Route.auth`, the `{ error: { code, message } }` envelope, `401` handling, and `503` with `Retry-After: 30` within a 5 s query timeout when the database throws.
    - Do not use Hono or any routing framework.
    - _Requirements: 7.9, 8.7, 12.6, 14.2_

  - [x] 8.3 Implement status, history and health handlers
    - `GET /api/health`, `GET /api/status/national`, `GET /api/status/airport/:code` (404 for unknown code), `GET /api/history/:code?since=` (clamped to 24 h).
    - Responses use the design's `NationalStatusResponse` and `AirportStatusResponse` shapes: `no_data` with no `stale` field, `stale` from `isStale`, `nationwide.active` from `nationwideStatus`, and `nationwide.explanation` from `explain` only when active. Read only from the database and make no FAA calls.
    - _Requirements: 4.4, 4.5, 4.8, 6.1, 6.2, 6.3, 6.7, 11.3, 11.7, 12.2, 12.3_

  - [x] 8.4 Implement authentication handlers
    - `POST /api/auth/magic-link` (validation, rate limit with `429`, SHA-256 hashed token, 15-minute expiry, send through the shared Resend client, invalidate the link and return an error if Resend fails), `POST /api/auth/redeem` (atomic redeem, 30-day Session cookie `HttpOnly; Secure; SameSite=Lax`), `POST /api/auth/logout`.
    - No password field or endpoint.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10_

  - [x] 8.5 Implement watchlist, account and unsubscribe handlers
    - `GET/POST /api/watchlist` (200 for add or already present, `409` for an 11th airport, `400` for an unmonitored airport), `DELETE /api/watchlist/:code` (idempotent), `DELETE /api/account` (single cascading delete), `POST /api/unsubscribe` (constant-time signature verification, returns the airport name).
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.9, 8.10, 9.8_

  - [x] 8.6 Register routes and create the API Worker entrypoint
    - Create `apps/api/src/routes.ts` as the single route table matching the design's endpoint table exactly, the Worker `index.ts` using `createFetchHandler(routes)`, and `wrangler.toml` for the API. Secrets come from Worker secrets only.
    - _Requirements: 14.2, 14.10_

  - [x] 8.7 Write property test for magic link validity
    - **Property 18: Magic link validity**
    - **Validates: Requirements 7.2, 7.4**

  - [x] 8.8 Write property test for the magic link rate limit
    - **Property 19: Magic link rate limit**
    - **Validates: Requirements 7.8**

  - [x] 8.9 Write property test for email address validation
    - **Property 20: Email address validation**
    - **Validates: Requirements 7.1, 7.5**

  - [x] 8.10 Write property test for watchlist invariants
    - **Property 21: Watchlist invariants over operation sequences**
    - **Validates: Requirements 8.1, 8.2, 8.4, 8.5, 8.8**

  - [x] 8.11 Write property test for idempotent remove
    - **Property 22: Watchlist remove is idempotent**
    - **Validates: Requirements 8.3**

  - [x] 8.12 Write property test for idempotent add
    - **Property 23: Watchlist add is idempotent**
    - **Validates: Requirements 8.6**

  - [x] 8.13 Write property test for the nationwide status threshold
    - **Property 11: Nationwide status threshold**
    - **Validates: Requirements 4.4, 4.5, 4.8**

  - [x] 8.14 Write property test for history request clamping
    - **Property 31: History request clamping**
    - **Validates: Requirements 11.7**

  - [x] 8.15 Write unit tests for API handlers
    - Zero outbound fetches on status routes, `no_data` response, 404 for an unknown airport code, stale true at 601 s and false at 600 s (also the API half of Property 16), `nationwide.active` true at 3 Affected_ARTCCs and false at 2, `401` for missing, expired and unknown Sessions, `503` with `Retry-After: 30` when the repository throws, `POST /api/watchlist` idempotent and `409` for an 11th airport, Resend failure invalidates a Magic_Link, and the route table matches the documented endpoints exactly.
    - _Requirements: 4.4, 4.5, 6.1, 6.2, 6.3, 6.7, 7.10, 8.5, 8.7, 12.6_

- [x] 9. Checkpoint - API complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement the frontend (apps/web)
  - Depends on: Task 7 (BLOCKING gate) and Task 9 (API complete). Do not start any sub-task before both are done.
  - [x] 10.1 Scaffold apps/web
    - Create `apps/web` with React 18 + Vite, strict tsconfig, and `vercel.json` rewriting `/api/*` to the API Worker.
    - Install jsdom, @testing-library/react and vitest-axe only if approved in 1.1.
    - _Requirements: 10.1, 14.1, 14.4_

  - [x] 10.2 Implement the API client and `useStatus`
    - Plain `fetch`, no router or state library. `useStatus()` loads `/api/status/national` on mount and every 60 s, each with `AbortSignal.timeout(10_000)`. On failure it keeps the last data and sets `refreshFailed`.
    - Filter Events older than 24 h client-side and order newest first.
    - _Requirements: 10.3, 10.4, 10.6, 10.7, 11.3_

  - [x] 10.3 Implement the status view components
    - A semantic `<table>` of all 20 airports with text status ("Ground stop" or "No ground stop reported"), the 24 h Events list with Explanations unchanged, and the capture time. No map.
    - Always-mounted `<div aria-live="polite">` holding `<StaleDataBanner>` (shown from the API `stale` flag only, with `capturedAt`) then `<SystemWideBanner>` (shown only when `nationwide.active`, heading "System-wide disruption" plus the Explanation unchanged), both above the table. Show the `no_data` message with no Stale_Data_Banner. Always-mounted `role="alert"` region for errors.
    - _Requirements: 4.8, 5.8, 6.2, 6.4, 6.5, 6.6, 6.7, 10.1, 10.2, 10.3, 10.5, 13.2, 13.4_

  - [x] 10.4 Implement sign-in and unsubscribe screens
    - Email entry, `/auth/callback` redeem via `POST /api/auth/redeem`, `/unsubscribe` confirmation via `POST /api/unsubscribe` naming the airport, and sign-out. Failures show error text in the `role="alert"` region and keep entered input.
    - _Requirements: 7.1, 7.3, 7.4, 7.9, 9.8, 13.7_

  - [x] 10.5 Implement the watchlist UI
    - Real `<button>` controls with visible focus outlines to add and remove airports, a text label distinguishing watched airports, and account deletion. A rejected add (including an 11th airport) shows the API error text in the `role="alert"` region and leaves the list unchanged.
    - _Requirements: 8.1, 8.2, 8.5, 8.9, 10.8, 13.1, 13.2, 13.3, 13.7_

  - [x] 10.6 Define the color palette tokens
    - Create CSS tokens that meet 4.5:1 for normal text and 3:1 for large text, component boundaries and focus indicators. Color is decoration only.
    - _Requirements: 13.2, 13.5_

  - [x] 10.7 Write property test for display window selection
    - **Property 28: Display window selection**
    - **Validates: Requirements 10.3, 10.4**

  - [x] 10.8 Write component tests
    - Stale_Data_Banner above the list with its time and removal after a fresh refresh, 20 rows and no map, system-wide banner only when `nationwide.active` is true and rendered above the table, banner text inserted into the live region without moving focus, 60 s refresh with fake timers, failed refresh keeps data and shows an error, watchlist labels, error text in `role="alert"` with input preserved.
    - _Requirements: 6.2, 6.4, 6.5, 6.6, 6.7, 10.1, 10.2, 10.6, 10.7, 10.8, 13.4, 13.7_

  - [x] 10.9 Write the color contrast unit test
    - Compute ratios for each palette token pair and assert the thresholds.
    - _Requirements: 13.5_

  - [x] 10.10 Add a site navigation bar shared by all pages
    - In `apps/web/src/components/NavBar.tsx`, render a `<nav aria-label="Main">` inside `App.tsx` with links to Status (`/`) and Watchlist (`/watchlist`), plus Sign in (`/sign-in`) when signed out or a Sign out button when signed in. Mark the current page with `aria-current="page"`.
    - Sign out calls the existing API sign-out endpoint and returns to `/`. Read session state through the existing API client; no business logic in the component.
    - Keyboard reachable with a visible focus indicator, using the existing CSS tokens. Add component tests and extend the vitest-axe suite to cover the nav bar.
    - _Requirements: 7.9, 13.1, 13.3_

  - [x] 10.11 Share one watchlist request between the nav bar and the watchlist page
    - The nav bar's session check and `WatchlistPage` both call `GET /api/watchlist` on load. Make them share one in-flight request and result (for example a shared hook or context in `apps/web/src/hooks/`), so `/watchlist` triggers exactly one call on load. After a watchlist change or sign-out, the shared state updates. No new dependencies.
    - Add a test asserting a single `/api/watchlist` request on `/watchlist` load; existing tests and the vitest-axe suite still pass.
    - _Requirements: 8.1, 10.8_

- [x] 11. Accessibility gate and final CI
  - [x] 11.1 Implement the vitest-axe accessibility suite
    - Run vitest-axe over the four core flows (status view with banners, Stale_Data_Banner, sign-in with Magic_Link, watchlist management) plus error states. Any WCAG 2.1 AA violation fails the test.
    - This suite is the Requirement 13.6 deliverable, so it is not marked optional.
    - _Requirements: 13.1, 13.6_

  - [x] 11.2 Add the accessibility job to CI
    - Extend `.github/workflows/ci.yml` with an accessibility job on `pull_request` that runs the suite from 11.1 and fails the pull request check on any violation. All jobs are required checks.
    - _Requirements: 13.6, 14.7, 14.11_

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Production verification
  - [x] 13.1 Verify the live FAA API endpoint matches fixtures/airport-events-live.json
  - [x] 13.2 Deploy poller + API to Cloudflare and frontend to Vercel; set production secrets
  - [x] 13.3 Live smoke test: one cron cycle, one snapshot visible in DB and UI, one real email delivered
  - [x] 13.4 Verify Resend production domain (not onboarding@resend.dev)
  - [x] 13.5 Add /api/health uptime monitoring (Better Stack or UptimeRobot)

- [~] 14. Contest compliance artifacts
  - [x] 14.1 Write docs/kiro-usage.md (answers Agents, Hooks, Specs, Steering, MCP, PBT questions)
  - [x] 14.2 Write README with setup steps a judge can follow
  - [x] 14.3 Add LICENSE (MIT) and confirm it shows in GitHub About
  - [ ] 14.4 Record <3min demo video on YouTube (working app: dashboard, email, stale banner)
  - [ ] 14.5 Verify .kiro/ not in .gitignore, flip repo public, submit on Devpost
  - [x] 14.6 Audit .kiro/ as a judge would: is the Kiro usage story visible and compelling?

- [ ] 15. Bonus prizes
  - [ ] 15.1 Publish public blog post mentioning Kiroween 2026, submit URL to Devpost
  - [ ] 15.2 Post on social with #KiroweenHackathon26 at the start, submit URL to Devpost

- [x] 16. Visual design system (additive, preserves all existing tests)
  - [x] 16.1 Create design tokens in apps/web/src/styles/tokens.css and a base reset
    - `tokens.css` already exists from Task 10.6: extend it with the token categories in design.md "Design System and Page Layouts" and add a base reset. Add every new color to `palette.ts` so `palette-sync.test.ts` still passes.
    - Extend the existing contrast test (Task 10.9) by adding every new foreground/background pair to `palettePairs`.
    - _Requirements: 15.1, 15.12, 13.5_

  - [x] 16.2 Verify the design-principles steering file exists
    - Confirm `.kiro/steering/design.md` exists with `inclusion: always` (created with this spec update).
    - _Requirements: 15.1_

  - [x] 16.3 Implement NavBar and Footer components and mount them in App.tsx
    - NavBar already exists from Task 10.10. Wrap the existing nav markup for styling only, and do not change its DOM structure or aria attributes.
    - Footer is new and renders after `<main>` with the three attributions from Requirement 15.3.
    - _Requirements: 15.2, 15.3, 15.11_

  - [x] 16.4 Implement reusable primitives, each with a unit test
    - Button (primary, secondary, danger, ghost), TextInput, FormLabel, FormError, StatusPill, Banner (stale, nationwide, error), EmptyState, LoadingState, MetricChip, ConfirmDialog.
    - Icons are inline SVG with no icon package. Icons used inside `StatusView` are CSS mask data URIs on `aria-hidden` spans (see design.md "Test Compatibility").
    - _Requirements: 15.5, 15.9, 15.11, 15.12_

  - [x] 16.5 Status page: implement PageHeader, SummaryCard with 3 MetricChips, and the "Last updated" indicator
    - PageHeader uses `<h2>`; `App.tsx` keeps the only `<h1>`. SummaryCard sits after the `aria-live` banner region.
    - _Requirements: 15.4, 10.5_

  - [x] 16.6 Status page: restyle the DataTable and add the "All (20) / Affected only" filter
    - Sticky header, alternating rows, and a StatusPill in the status cell, with one `tbody tr` per airport as today.
    - Add the "All (20) / Affected only" segment control as a client-side filter using `aria-pressed` buttons. The default view SHALL render 20 rows.
    - _Requirements: 15.5, 15.6, 10.1_

  - [x] 16.7 Status page: sort ground stops first, then alphabetically by code
    - Sort only the status table, not `WatchlistTable`, whose tests rely on its current order.
    - Update the existing 10.8 test to assert the sorted order while preserving the 20-row assertion.
    - _Requirements: 15.6_

  - [x] 16.8 Status page: render recent events as EventCard components
    - Each Event stays a list item, newest first, with its Explanation unchanged.
    - _Requirements: 15.7, 10.3, 5.8_

  - [x] 16.9 Restyle the Banner variants (stale, nationwide, error)
    - Add an icon, a left border accent, and a surface background. Do not change their DOM position or aria attributes, and keep the `role="alert"` text exactly the message.
    - _Requirements: 6.4, 10.2, 13.4, 15.1_

  - [x] 16.10 Status page: implement the empty state (no_data) and the loading state
    - The loading state shows text, never a blank page, and adds no `aria-live` element before the banner region.
    - _Requirements: 15.9, 6.7_

  - [x] 16.11 Watchlist page: header, counter, watched list, add grid, and account section
    - PageHeader with the counter chip "N of 10 airports watched", the watched list with Remove buttons, and the add-airports grid with the add control disabled for already-watched airports.
    - The add-airports grid keeps the `WatchlistTable` DOM (20 `tbody tr` rows, "Watching"/"Not watching" text, existing button names). Add controls stay enabled at 10 airports so the 11th-airport error still shows.
    - Account section with a ConfirmDialog for delete, keeping the button names "Confirm delete account" and "Cancel".
    - _Requirements: 15.8, 13.7, 8.9_

  - [x] 16.12 Sign in, Auth callback, Unsubscribe, and 404 pages
    - Implement with consistent primitives and success, error, and loading states. Change the `App.tsx` default case from the Status page to the Not found page; `/` still renders Status.
    - _Requirements: 15.9, 15.11, 7.4_

  - [x] 16.13 Responsive layout check
    - Verify all pages render correctly at 375px, 768px, 1024px, and 1440px. Add a visual regression note in docs (no automated screenshots required).
    - _Requirements: 15.10_

  - [x] 16.14 Verify the Task 10.9 contrast test passes for all token pairs
    - Fix failing pairs by adjusting tokens, not by lowering thresholds.
    - _Requirements: 15.12, 13.5_

  - [x] 16.15 Verify the Task 11.1 vitest-axe suite passes on all 6 pages plus error states
    - If any violation appears, fix the UI, not the test.
    - _Requirements: 13.1, 13.6_

  - [x] 16.16 Run the full test suite
    - Confirm Tasks 10.8, 10.9, and 11.1 all still pass with no test modifications other than the sort-order assertion update in 16.7.
    - _Requirements: 13.6, 14.7_

  - [x] 16.17 Show "Last updated" once on the Status page
    - Remove the "Last updated" time from the Status page header and keep it in the SummaryCard only.
    - _Requirements: 15.4, 10.5_

  - [x] 16.18 Make the watched list read-only chips
    - Replace the Remove buttons in the Watchlist page's watched list with plain chips (code and name). Removing an airport is done from the table row only, so each airport has one Remove control. Update the 16.11 layout test accordingly; pre-existing tests stay unchanged.
    - _Requirements: 15.8, 13.3_

  - [x] 16.19 Give disabled controls a dedicated disabled color
    - Replace the 60% opacity on disabled buttons with disabled text, background and border tokens, added to `palette.ts`, `tokens.css` and `palettePairs` (disabled controls are exempt from WCAG contrast, but pick readable values).
    - _Requirements: 15.1, 15.12_

  - [x] 16.20 Add an npm test script to apps/web
    - Add `"test": "vitest --run"` (or the equivalent that runs the web tests from `apps/web`) to `apps/web/package.json` scripts. No dependency changes.
    - _Requirements: 14.6_

  - [x] 16.21 Widen the border contrast margin
    - Darken `color-border` so it reaches at least 4.5:1 on `color-bg`, `color-surface` and `color-surface-raised` (currently 4.42:1 on `color-surface`), keeping `palette.ts` and `tokens.css` in sync.
    - _Requirements: 15.12, 13.5_

- [x] 17. Dashboard visual overhaul (CSS only, preserves all tests)
  - [x] 17.1 Typography and base CSS in apps/web/src/index.css
    - Create `apps/web/src/index.css`, imported last in `main.tsx`. Font `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`; page background `#f8fafc`; text `#0f172a`; content container `max-width: 1000px; margin: 0 auto; padding: 2rem`.
    - Colors are tokens in `palette.ts` and `tokens.css`, with pairs in `palettePairs`.
    - _Requirements: 15.1, 15.10, 15.12_

  - [x] 17.2 Summary hero card
    - White card, 12px radius, `0 1px 3px rgba(0,0,0,0.1)` shadow, 24px padding. The overall status value is 2rem bold, green `#16a34a` when normal and red when any ground stop or system-wide disruption is active. Count chips are grey pills (`#f1f5f9` background, `#475569` text, 4px 12px padding, 999px radius, 0.875rem).
    - _Requirements: 15.4, 15.12_

  - [x] 17.3 Modern airport table
    - No vertical or outer borders; white table with 12px radius and shadow; uppercase muted header cells; 16px body cells with a 1px `#e2e8f0` bottom border; airport code 700 weight 1rem `#0f172a`; name column muted `#64748b` 0.875rem; softer status pills (green `#dcfce7` / `#166534` when normal, a matching red pair for ground stops). Table DOM unchanged.
    - _Requirements: 15.5, 15.6, 15.12_

  - [x] 17.4 Event alert cards
    - White card with a 1px `#e2e8f0` border, 4px left border (blue `#3b82f6` default, red `#ef4444` for ground stop started, green `#22c55e` for ended), 8px radius, 16px padding, 12px gap. Header row uses flex `space-between` with a bold title and a muted 0.875rem timestamp.
    - _Requirements: 15.7, 15.12_

## Notes

- Tasks marked with `*` are optional test-only sub-tasks and can be skipped for a faster MVP. Task 11.1 is intentionally not optional because it is the Requirement 13.6 gate.
- Blocking tasks: 4 (Poller), 5 (Change_Detector), 6 (alert engine/Notifier). Gate: Task 7. No `apps/web` work before the gate. The frontend also needs the API (Task 8, Task 9).
- Pending approvals: Zod (Task 1.1 confirms before Task 2.2) and vitest-axe, jsdom, @testing-library/react (confirmed in 1.1 before Task 10.1). Fallbacks are in Task 1.1.
- Hono is not approved. The API uses the hand-written router.
- `packages/mail` (Task 6.1) is a small layout addition to the design so the Poller and the API share one Resend client.
- Each property test carries the tag `// Feature: aerobrief, Property N: <title>` and runs with `numRuns` of 100 or more.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "1.4", "2.1"] },
    { "id": 3, "tasks": ["2.2", "2.4", "2.5"] },
    { "id": 4, "tasks": ["2.3", "2.6", "2.7", "3.1"] },
    { "id": 5, "tasks": ["2.8", "2.9", "2.10", "2.11", "2.12", "2.13", "2.14", "3.2", "3.3", "4.1", "4.2", "5.1"] },
    { "id": 6, "tasks": ["3.4", "3.5", "4.3", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.8", "5.9", "5.10", "5.11", "6.1"] },
    { "id": 7, "tasks": ["4.4", "5.12", "5.13", "5.14", "5.15", "5.16", "6.2"] },
    { "id": 8, "tasks": ["6.3", "6.5", "6.8"] },
    { "id": 9, "tasks": ["6.4", "6.6", "6.7", "6.9", "6.11"] },
    { "id": 10, "tasks": ["4.5", "6.10", "6.12"] },
    { "id": 11, "tasks": ["8.1", "8.2"] },
    { "id": 12, "tasks": ["8.3", "8.4", "8.5", "8.7", "8.8", "8.9", "8.10", "8.11", "8.12"] },
    { "id": 13, "tasks": ["8.6", "8.13", "8.14"] },
    { "id": 14, "tasks": ["8.15"] },
    { "id": 15, "tasks": ["10.1"] },
    { "id": 16, "tasks": ["10.2", "10.6"] },
    { "id": 17, "tasks": ["10.3", "10.9"] },
    { "id": 18, "tasks": ["10.4", "10.7"] },
    { "id": 19, "tasks": ["10.5"] },
    { "id": 20, "tasks": ["10.8", "11.1"] },
    { "id": 21, "tasks": ["11.2"] }
  ]
}
```
