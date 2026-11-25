# Decisions

## 2026-11-15: Stack deviation approvals (Task 1.1)

| Dependency | Type | Decision | Fallback taken |
| --- | --- | --- | --- |
| Zod | runtime | Approved | None. Zod approved, no fallback taken. |
| vitest-axe | dev-only | Approved | None. No fallback taken. |
| jsdom | dev-only | Approved | None. No fallback taken. |
| @testing-library/react | dev-only | Approved | None. No fallback taken. |
| Hono | runtime | Not approved | The API uses the hand-written router specified in design.md. Do not install or import Hono. |

Notes:
- Requirement 13.6 (automated accessibility checks) can be met with the approved tools.
- Nothing was installed in Task 1.1. Installation happens in later tasks (Zod in Task 1.2/2.2, accessibility tools in Task 10.1).

## Task 10.1: apps/web scaffold

- `apps/web` added with React 18.3, Vite and `@vitejs/plugin-react`. No router or state library.
- Installed the approved dev-only tools: jsdom, @testing-library/react, vitest-axe.
- Flag: `@testing-library/dom` is also a dev dependency. `@testing-library/react` v16 lists it as a peer dependency, so it is required, not a new capability. `@testing-library/jest-dom` was not added.
- `vercel.json` uses the placeholder API host `https://aerobrief-api.<your-subdomain>.workers.dev`. Replace it before deploying (see `apps/web/README.md`).
- Root `vitest.config.ts` now uses `projects`: a `node` project (excludes `apps/web`) and the `apps/web` jsdom project.

## 2026-11-15: @testing-library/dom approved (Task 10.1)

| Dependency | Type | Decision | Fallback taken |
| --- | --- | --- | --- |
| @testing-library/dom | dev-only | Approved. Required peer dependency of @testing-library/react v16. | None. |

## 2026-11-16: npm audit fixes (drizzle-orm bump, esbuild override)

Two `npm audit` findings were resolved without `npm audit fix --force`.

**1. HIGH: drizzle-orm < 0.45.2 (GHSA-gpj5-g38j-94v9).** SQL injection through improperly escaped SQL identifiers.
- `packages/db/package.json`: `drizzle-orm` `^0.44.0` -> `^0.45.4`. Installed was 0.44.7.
- `drizzle-kit` stays at `^0.31.0`, the current line.
- Reviewed usage in `packages/db/src` and `apps/*`: `drizzle({ client, schema })` from `drizzle-orm/neon-http`, `db.batch`, `pgTable` with array-style extra-config callbacks, `timestamp(..., { withTimezone, precision })`, and `sql` templates. No change was needed.

**2. MODERATE, dev-only: esbuild <= 0.24.2 (GHSA-67mh-4wv8-2f99).** Any website can send requests to the esbuild dev server and read the responses. The chain is `drizzle-kit` -> `@esbuild-kit/esm-loader` -> `@esbuild-kit/core-utils` -> `esbuild ~0.18`.
- npm's suggested fix (downgrade `drizzle-kit` to 0.18.1) is wrong, so it was not applied.
- Root `package.json` now has `"overrides": { "@esbuild-kit/core-utils": { "esbuild": "~0.25.12" } }`.
- Why this is safe: `drizzle-kit` is a dev-only CLI. It uses esbuild to transpile config and schema files and never starts the esbuild dev server (`serve`), so the vulnerable code path is not reachable. The override only moves the transitive esbuild to a patched release.
- Removal: delete the override once `drizzle-kit` drops `@esbuild-kit`.

## 2026-11-16: External uptime monitor (Task 13.5)

| Item | Type | Decision | Fallback taken |
| --- | --- | --- | --- |
| Better Stack or UptimeRobot | external SaaS, no code dependency | Approved by the user as a deviation from the fixed stack. | None. Nothing is installed in the repo. The monitor only sends `GET /api/health`. |

Notes:
- Why needed: Cloudflare cron and Workers cannot alert on their own absence. An external check on `GET /api/health` is the only signal that the API is down.
- In-stack option considered: a Cloudflare Worker cron that pings the API. Rejected because it runs on the same platform it is supposed to watch.
- Choice: UptimeRobot free plan (5-minute interval, keyword check, email alert). Better Stack is the alternative. Setup is in `docs/production-runbook.md` section 13.5.
- Checked 2026-11-17: `/api/health` returns 200 `{"status":"ok"}` on both `https://www.aerobriefs.com` and `https://aerobrief-api.vamegah.workers.dev`. It is a constant response (no DB, no secrets), so no code change was made. It does not detect a stopped poller. The optional `"stale":true` keyword monitor on `/api/status/national` covers that.
- Plan limit: as of 2026-11-16 the free plans do not offer 1-minute checks (Better Stack free: 3 minutes, UptimeRobot free: 5 minutes). A 1-minute interval needs a paid plan. Record the interval actually used in `docs/production-runbook.md` section 13.5.

## 2026-11-17: Live smoke test (Task 13.3), partial

Checked against production (Neon project `bitter-fire-42970215`, branch `production`; API `aerobrief-api.vamegah.workers.dev`; site `www.aerobriefs.com`). Read-only queries only.

| Check | Result | Evidence |
| --- | --- | --- |
| 1. Poller cron cycle | Pass | `job_runs` has consecutive `poll` rows with `outcome = success` at 22:25, 22:30 and 22:35 UTC (5 min cadence, each with a `snapshot_id`). |
| 2a. Snapshot stored in Neon | Pass | `snapshots` holds 11 rows; latest `captured_at` 2026-11-17T22:35:29.396Z, matching the latest job run. |
| 2b. Snapshot via deployed API | Pass | `GET /api/health` returns 200 `{"status":"ok"}`. `GET /api/status/national` returns 200, `state: ok`, `stale: false`, same `capturedAt`, 20-airport list. |
| 2c. Snapshot via Vercel site | Pass (API path only) | `https://www.aerobriefs.com/` returns 200 and `/api/status/national` through the Vercel rewrite returns the same `capturedAt`. The rendered table was not checked in a browser. |
| 3. Real email through Resend | Pass (send accepted; inbox receipt pending user confirmation) | Earlier attempt (~22:49 UTC) failed 502 because aerobriefs.com was not verified in Resend. After the user verified the domain, one request at 2026-11-17 23:02:35 UTC: `POST /api/auth/magic-link` (Origin `https://www.aerobriefs.com`, recipient the owner address, user-approved) returned 200 `{"ok":true}`. Neon `magic_links` has a new row for that email (id `2b12ae0f-cea6-4818-80ae-33a0c71cfdc3`, created 23:02:37Z, expires 23:17:37Z, `used_at` and `invalidated_at` null), so the handler did not invalidate it after sending. The 22:49 row is invalidated. Inbox delivery is not yet confirmed by the user. |

Remaining to close 13.3:
- Ask the user to confirm the magic-link email arrived in their inbox (and the link opens the callback page), then close 13.3.
- The deployed Worker's `MAIL_FROM` var in `wrangler.jsonc` is already `AeroBrief <alerts@aerobriefs.com>`. Which value the running Worker uses was not independently confirmed (Worker logs were not available). The local `.env` still has `MAIL_FROM=AeroBrief <alerts@example.com>`.
- Optional: load the site in a browser and confirm the table and capture time.

Note: a direct Node connection to Neon from this machine fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (likely local TLS interception). The checks used the Neon MCP tools instead.

## Task 13.4: Resend production domain verified

- aerobriefs.com is verified in Resend. The magic-link email from `AeroBrief <alerts@aerobriefs.com>` reached the inbox (task 13.3).
- No source, workflow or doc uses `onboarding@resend.dev` as a sender. `example.com` remains only in test fixtures.
- `apps/api/wrangler.jsonc` and `apps/poller/wrangler.jsonc` both set `MAIL_FROM` to `AeroBrief <alerts@aerobriefs.com>`.
- `.env.example` documents `MAIL_FROM` with the note that it must be a verified Resend domain (placeholder `alerts@your-domain.com`).
- Fixed stray references: both `.dev.vars.example` files and the stale placeholder note in `docs/production-runbook.md` now use the aerobriefs.com address.

## 2026-11-18: Kiroween 2026 category: Frankenstein (Task 14.7)

**Choice:** Frankenstein. The user picked it. The category asks for a chimera of technologies stitched into one app, bringing together elements that don't obviously belong together.

**Why it fits, from what is in the repo:**

| Part | Where it lives | What it does in the stitched whole |
| --- | --- | --- |
| Government data feed | `apps/poller/src/faa-client.ts` (`https://nasstatus.faa.gov/api/airport-events`, the only host the poller calls) | Source of ground stop data, validated with Zod in `packages/core/src/schemas.ts` |
| Scheduled edge compute | `apps/poller/wrangler.jsonc` (crons `*/5` and `*/30`), `apps/api/wrangler.jsonc` | Cloudflare Workers poll every 5 minutes and serve the API. No always-on server |
| Serverless Postgres | `packages/db` (Drizzle, `@neondatabase/serverless`), 4 migrations | Snapshots, events, watchlists, sessions, alert log, with 24 hour retention |
| Pure, property-tested core | `packages/core/src/` (change detector, explanation mapper, event keys, watchlist rules), 44 `*.pbt.test.ts` files using fast-check | Decides what changed and says why in plain English, with no I/O |
| Transactional email | `packages/mail` (Resend over `fetch`, retries, `Idempotency-Key`), `packages/core` unsubscribe signing | Alert emails, magic-link sign-in, signed one-click unsubscribe. No passwords |
| Accessible frontend | `apps/web` (React 18 + Vite, Vercel), `styles/palette.ts`, contrast test, vitest-axe suite | Dashboard and watchlist, text-first status, tested against WCAG 2.1 AA contrast |
| Kiro process | `.kiro/specs`, `.kiro/steering`, `.kiro/hooks` | Spec-driven build; steering rules enforced by `tests/repo-guard.test.ts` |

**The chimera:** an aviation data feed, edge cron jobs, a serverless database, a verified pure-logic core, an email system that doubles as the login mechanism, and an accessibility-tested UI are combined into one crisis tool. The tool is meant to keep serving cached data, with a visible stale banner, when the FAA's own status page fails.

**Alternatives not chosen:** Resurrection (no old technology is revived), Skeleton Crew (the app is not a flexible base with two distinct uses), Costume Contest (no spooky UI theme; the design rules say clarity over decoration).

**Not claimed:** The stitching is unusual in how the parts combine, not in any single exotic technology. The FAA feed is public JSON and the design is conventional.


## 2026-11-18: Phase 2 Neon branch created (task 1.10)

Created a copy-on-write child branch for Phase 2 schema work. Production was not modified.

| Item | Value |
| --- | --- |
| Neon project | `aero-brief` (`bitter-fire-42970215`) |
| Branch name | `phase-2` |
| Branch id | `br-odd-feather-bbpy60hl` |
| Parent branch | `production` (`br-delicate-bar-bbqk6hwk`, default) |
| Endpoint host | `ep-billowing-union-bbe8q751.c-15.us-east-1.aws.neon.tech` |
| Production endpoint host (for comparison) | `ep-purple-snow-bb1xmfs9.c-15.us-east-1.aws.neon.tech` |

No connection string or password is recorded here. The branch holds a copy of production data, including users, until task 1.11 deletes the copied users.

2026-11-18: Copied production users deleted and two allowlisted test users seeded on branch phase-2 (verified by read-only counts).
2026-11-19: Migration 0004 (webhooks) applied to branch phase-2 via Neon MCP run_sql_transaction; drizzle-kit not used because the branch has no __drizzle_migrations table.
- 2026-11-19: Task 4.37 (real Slack incoming-webhook check) dropped by the project owner. The payload's `text` field follows Slack's documented format, but delivery to a real Slack workspace is unverified.
- 2026-11-19: Task 4.39 branch integration tests passed (6 passed, destructive DDL test skipped). They needed NODE_OPTIONS=--use-system-ca on the owner's machine because local HTTPS inspection re-signs certificates; TLS verification was not disabled.
- 2026-11-19: Migration 0005 (digest) applied to branch phase-2 via Neon MCP run_sql_transaction; drizzle-kit not used because the branch has no __drizzle_migrations table. Role aerobrief_runtime already holds SELECT, INSERT, UPDATE and DELETE on digest_preferences and digest_deliveries (default privileges), so task 5.11 needs no extra grants.
- 2026-11-20: Task 5.22 (digest cron run locally) passed. In `apps/poller`, `npx wrangler dev --test-scheduled` was triggered at `/__scheduled?cron=0+*+*+*+*` twice, with `FEATURE_DIGESTS=true`, `SAFE_SEND_MODE=true` and the allowlist holding the owner address. The database was the Neon `phase-2` branch, not production.
  - Result: the owner address received exactly one digest email. `digest_deliveries` held one row per user for digest date 2026-11-20. The owner row was `handed_off` with attempts 1. `digest-skip-test@example.invalid` was `skipped` with skip_reason `not_allowlisted` and attempts 0. The second trigger sent nothing new.
  - Fixes found on the way: (a) workerd rejects non-handler named exports from the Worker main module, so the cron constants moved to `apps/poller/src/crons.ts` and `entry-exports.test.ts` now guards both Workers' entry files. (b) `digest_run_failed` now logs `stage`, `errorMessage`, `causeName` and `causeMessage` (truncated to 500 characters, secrets redacted by the logger) because the old log gave only the error name. (c) Local HTTPS inspection requires `NODE_EXTRA_CA_CERTS` to point at the inspecting root CA when running wrangler dev. (d) `.dev.vars` held a `DATABASE_URL` for a database without migration 0005, which gave `relation "digest_preferences" does not exist`. It must use the phase-2 branch runtime-role string (host `ep-billowing-union-bbe8q751...`).
  - Note: production has neither migration 0004 nor 0005 yet. Turning `FEATURE_DIGESTS` on in production before applying them would fail the same way (covered by task 6.6).
- 2026-11-20: Task 6.1 exception accepted by the project owner. `apps/web/test/components/airport-page.test.tsx` differs from tag `mvp-contest-2026` by 35 added lines and 0 removed lines. The additions are an "AirportPage ground stop durations" describe block with 2 tests from MVP section 21 (commit 086e681), not Phase 2 work. No MVP test was deleted, skipped or weakened.
- 2026-11-20: Task 6.2 checkpoint (all four flags on) run on branch `phase-2` at 58daf5c. No flags-on script or test setup exists, so `FEATURE_DARK_MODE`, `FEATURE_HIGH_CONTRAST`, `FEATURE_WEBHOOKS` and `FEATURE_DIGESTS` were set to `true` in the process environment. Flag-on tests in web, API and Poller set their own flags (`FeaturesContext.Provider` values and `baseEnv` objects), so the process variables do not change what they test.
  - `npm test`: 198 test files passed, 1 failed, 6 skipped (205); 1800 tests passed, 1 failed, 15 skipped (1816). The one failure is `apps/web/test/features-provider.test.tsx > does not read a build-time variable for flags`. It is an environment artifact: vitest copies `FEATURE_*` process variables into `import.meta.env`, and the guard correctly rejects them. The guard was not weakened. With the variables unset, that file passes (14 of 14).
  - `npm run typecheck` with the flags on: exit 0. `npm run build -w @aerobrief/web` with the flags on: exit 0 (94 modules, 189.00 kB JS, 30.06 kB CSS).

## 2026-11-22: Vercel Function relay for the FAA poll (approved deviation from tech.md)

The production poller gets HTTP 403 from the FAA on every poll, so no Snapshot is stored. The owner chose a relay on a Vercel Function (option 2) and approved the deviation from `tech.md` on 2026-11-22. Spec: `.kiro/specs/faa-403-poller/` (`bugfix.md`, `design.md`). Evidence: `.kiro/specs/faa-403-poller/probe-result.md`.

| Question | Answer |
| --- | --- |
| What is outside the approved stack? | A Vercel Function used as a backend component. `tech.md` names Cloudflare Workers for the poller and the API and uses Vercel only for the frontend. |
| Why is it needed? | The FAA edge denies requests from Cloudflare Workers. A throwaway Worker called `https://nasstatus.faa.gov/api/airport-events` three ways from Cloudflare colo DFW on 2026-11-21 (no headers, the AeroBrief `User-Agent`, a browser-like `User-Agent`). All three got HTTP 403 with an "Access Denied" page. The same URL returns 200 with valid JSON from the owner's machine. The live site shows no data because of it. |
| In-stack options considered | (a) Request headers on the Worker: ruled out, all three header variants got 403. (b) Contact the FAA to be allowed: possible later, but no answer is expected before December 4, 2026. (c) A GitHub Actions scheduled job as the poller: GitHub's schedule is unreliable (delayed or skipped runs). |
| Approved by, when | The owner, explicitly, 2026-11-22. |
| Scope of the exception | One Vercel Function, `apps/web/api/internal/faa-relay.ts`, one fixed upstream URL (`https://nasstatus.faa.gov/api/airport-events`). It does not permit other Vercel Functions or other backend logic. It is not an always-on server: it runs per request. |
| Rollback | Unset `FAA_RELAY_URL` and `FAA_RELAY_SECRET` on `aerobrief-poller` (`npx wrangler secret delete <NAME> --name aerobrief-poller`). The poller calls the FAA directly again, as before. No deploy is needed. |

Approved recommendations (owner, 2026-11-22):
1. Rate limit: add a Vercel Firewall rate-limit rule on `/api/internal/faa-relay` if the owner's Vercel plan includes rate limiting. Not yet checked whether the plan includes it. Calls without the key still count as function invocations, and going over Hobby limits pauses the whole project.
2. Non-2xx pass-through: when the FAA answers non-2xx, the relay passes the status and only a 300-character text excerpt of the body, not the full HTML.
3. Fail closed: the poller fails closed on an invalid `FAA_RELAY_URL` or `FAA_RELAY_SECRET`. It makes no request and records a failed `job_run` (`failure_kind=validation`). It does not fall back to a direct call.

Notes:
- Not yet known whether Vercel's network is also denied by the FAA. Task 10 proves it on a Preview deployment before the poller changes. If Vercel is denied too, work stops and the owner is told (requirement 2.7). A second relay host would be another deviation and needs its own approval.
- Probe Worker `aerobrief-faa-probe` was deleted on 2026-11-22. Its `workers.dev` URL now returns 404. `tools/faa-probe/` is still in the repo until the checkpoint task removes it.
- Scraping, FAA SWIM and other data sources stay prohibited by `scope.md`. This entry does not change them.

## 2026-11-24: UI refresh decisions

The owner approved every recommendation on 2026-11-24. Spec: `.kiro/specs/ui-refresh/` (`design.md`, "Decisions (approved 2026-11-24)").

- D1: One "Settings" link is added to the Nav_Bar. Only the nav tests change for it.
- D2: Deep links use the hash: `/settings#display`, `#digest`, `#webhooks`, `#account`.
- D3: The palette is retuned in `tokens.css` and `palette.ts`, and the two SHA-256 hashes in `tests/flags-off-guard.test.ts` are updated in the same commit.
- D4: Signed-out visitors see the Display Section on `/settings`. Daily digest, Webhooks and Account show the sign-in state.
- D5: Watchlist row "Add" is `secondary`, "Remove" is `ghost`. The page has no primary Button.
- D6: CSS `display` overrides for stacked tables are accepted. ARIA roles are added only if the owner's phone check (task 10) finds that VoiceOver loses table semantics.
- D7: The header brand is the single `<h1>`. The tagline moves to the Status page subtitle.
- D8: The refresh supersedes Phase 2 Requirements 3, 8.1, 9.7, 9.12 and 10.1, and the Phase 2 guardrail against editing `tokens.css`, `palette.ts` and existing tests.
- D9: The refresh ships to `main` before December 4, 2026, 2:00 PM PT, unflagged, and rolls back with `git revert` of the refresh commit range.
- D10: The palette values in `design.md` are the starting point. The owner reviews them on a Vercel Preview of `phase-2` before `main` (task 10). A Preview is built only when a push changes files under `apps/web`, and the owner cannot use Vercel's Redeploy button (2FA), so every Preview needs a push that touches `apps/web`.
- D11: Content max width is 1120 px.

Supersession (D8): for this refresh only, it supersedes Phase 2 Requirements 3, 8.1, 9.7, 9.12 and 10.1 and the Phase 2 guardrail against editing `tokens.css`, `palette.ts` and existing tests. The Phase 2 spec is not otherwise changed.

Scope (D9): the refresh is MVP polish approved by the owner on 2026-11-24. It is not a Phase 2 item, so the "contest set only" merge rule in `scope.md` does not cover it. It ships unflagged to `main` before December 4, 2026, 2:00 PM PT. Rollback is `git revert` of the refresh commit range.

## 2026-11-24: Core 30 airports and watchlist of 30

The owner decided on 2026-11-24: "Core 30, watchlist 30, keep the rest." Spec: `.kiro/specs/core30-limits/` (`requirements.md`, `design.md`, `tasks.md`).

**What changes**

| Limit | Before | After |
| --- | --- | --- |
| Monitored airports | 20 hardcoded | The 30 FAA Core 30 airports (10 added: BWI, CLT, FLL, HNL, IAD, LGA, MDW, PHL, SAN, TPA) |
| Watchlist cap | 10 | 30 |
| History retention | 24 hours | 24 hours (unchanged) |

**Why:** the MVP caps of 20 airports and 10 per watchlist were set for schedule reasons only, not for a product or technical reason. The owner removed them.

**FAA sources for the Core 30 list** (checked 2026-11-24):
- https://www.aspm.faa.gov/aspmhelp/index/ASPM_77.html (airports marked "Core 30")
- https://aspm.faa.gov/aspmhelp/index/OEP_35.html (Core 30 is OEP 35 without Cincinnati, Cleveland, Pittsburgh, Portland and St. Louis)
- https://www.faa.gov/air_traffic/flight_info/aeronav/procedures/reports/media/OEP_Airports.pdf

**Scope rules changed**
- The rule that only the contest set (dark mode, high-contrast theme, daily digest, signed webhooks) may merge into `main` before the deadline is removed.
- The rule that every other Phase 2 item stays on `phase-2` until judging has finished is removed.
- The Kiroween 2026 submission is `main` as of December 4, 2026, 2:00 PM PT.
- Tag `mvp-contest-2026` stays as the MVP restore point.

**Rules that stay in force**
- No scraping of any site. Third-party data comes only from a provider's licensed API, after its terms are reviewed and a key or contract exists.
- Billing and any commercial use wait for a review of the FAA data terms and of each data provider's license.
- No user passwords. Single sign-on and magic links are the only ways to sign in.
- Push notifications to devices, map view, native mobile apps and FAA SWIM stay prohibited.
- Every Phase 2 feature sits behind its own feature flag, off by default.
- Every Phase 2 schema change is a separate, reversible migration, run only against a Neon branch, never the production database, until it is merged.
- Rollback rule: if a feature fails, turn its flag off and revert its commits. If the branch as a whole fails, delete it. `main` and tag `mvp-contest-2026` are the contest MVP.
- `main` is frozen after the deadline until judging has finished.

**No feature flag.** The new limits are core product limits, not a flagged Phase 2 feature. Rollback is `git revert` of the commit range, then the down file of migration `0006` (`packages/db/migrations/down/0006_watchlist_cap_30.down.sql`), run in one transaction with the owner's approval. The down file deletes the stored 30-airport Snapshots and the last 24 hours of events for the 10 new airports, so the dashboard shows "no data" for up to 5 minutes. Users who already watch a new airport keep that row.

**Release order (fixed)**
1. Apply migration `0006_watchlist_cap_30.sql` to the `phase-2` Neon branch and verify it there.
2. Take a restore point of production, then the owner applies `0006` to the production database in one transaction.
3. Only then the owner fast-forwards `main` from `phase-2` and pushes, before the deadline. The push deploys the API Worker, the Poller Worker and the web app.

The reverse order would show the new counter of 30 against the old trigger of 10.

## 2026-11-25: Recovering window follows the AeroBrief estimate

**Decision.** An airport reads "Recovering" after a ground stop ends until the upper bound of the AeroBrief estimate for that stop has passed since the stop ended. The window is clamped to a minimum of 1 hour and a maximum of 24 hours. When the stop's start is unknown (outside the retention window) the window is the 24-hour maximum.

**Supersedes.** Requirement 1.2 of `.kiro/specs/ui-improvements/requirements.md`, which fixed the window at 24 hours (`RECOVERY_PERIOD_MS`). The ui-improvements spec files are not edited. The change is specified in `.kiro/specs/ui-review-fixes/` (Requirement 19, design section 9).

**Why.** A 40-minute stop should not leave an airport at "Recovering" for a full day.

**Implementation.** `packages/core/src/status-derivation.ts` exports `RECOVERY_MIN_MS` (1 h), `RECOVERY_MAX_MS` (24 h, the old `RECOVERY_PERIOD_MS` value) and `recoveryWindowMs`. `RECOVERY_PERIOD_MS` is removed because nothing else imported it. The Overview, the Airports table and the watchlist all read `deriveAirportStatus`.

**Approved by.** The owner, in the 2026-11-25 second-round review ("all").
