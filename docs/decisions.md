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
| 3. Real email through Resend | Pass (send accepted; inbox receipt pending user confirmation) | Earlier attempt (~22:49 UTC) failed 502 because aerobriefs.com was not verified in Resend. After the user verified the domain, one request at 2026-11-17 23:02:35 UTC: `POST /api/auth/magic-link` (Origin `https://www.aerobriefs.com`, recipient `vamega13@gmail.com`, user-approved) returned 200 `{"ok":true}`. Neon `magic_links` has a new row for that email (id `2b12ae0f-cea6-4818-80ae-33a0c71cfdc3`, created 23:02:37Z, expires 23:17:37Z, `used_at` and `invalidated_at` null), so the handler did not invalidate it after sending. The 22:49 row is invalidated. Inbox delivery is not yet confirmed by the user. |

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
