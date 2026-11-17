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
- Plan limit: as of 2026-11-16 the free plans do not offer 1-minute checks (Better Stack free: 3 minutes, UptimeRobot free: 5 minutes). A 1-minute interval needs a paid plan. Record the interval actually used in `docs/production-runbook.md` section 13.5.
