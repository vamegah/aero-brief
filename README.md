# AeroBrief

AeroBrief watches FAA airport status and sends plain-language email alerts when a ground stop starts or ends at an airport you follow. It also raises a "system-wide disruption" notice when ground stops affect three or more FAA centers (ARTCCs) at once.

Every explanation is written in plain English, so a traveler doesn't need to read FAA jargon.

- Live app: https://www.aerobriefs.com
- Demo video (under 3 minutes): https://youtu.be/zM7OS0r_CiI

## MVP scope

These limits are fixed for the MVP:

- The 30 FAA Core 30 airports are monitored (`packages/core/src/airports.ts`). The list follows the [FAA ASPM help page](https://www.aspm.faa.gov/aspmhelp/index/ASPM_77.html).
- A watchlist holds at most 30 airports.
- History retention is 24 hours.
- Not included: FAA SWIM, scraping third-party sites, push notifications, a map view, native apps, passwords (sign-in is by emailed magic link) and monetization.

## Phase 2 features (built, off by default)

Four Phase 2 features are merged into `main`. Each sits behind its own flag, and every flag is **off by default** in code. They are live in production: the Phase 2 migrations (`0004`, `0005`, `0006`) are applied and all four flags are on there. With every flag off, AeroBrief behaves exactly as the MVP does.

| Feature | Flag | Default | What it does |
| --- | --- | --- | --- |
| Dark mode | `FEATURE_DARK_MODE` | off | A dark colour theme for the web app |
| High-contrast theme | `FEATURE_HIGH_CONTRAST` | off | A higher-contrast theme for the web app |
| Daily digest | `FEATURE_DIGESTS` | off | An optional daily email digest, sent at an hour (0 to 23) you choose |
| Signed webhooks | `FEATURE_WEBHOOKS` | off | Up to 3 HTTPS URLs per account that receive a signed `POST` when a ground stop starts or ends, or a nationwide ground stop is detected |

A flag is on only when its value is exactly the text `true`. A missing flag, `false`, or any other value means off. Flags are set for `apps/api` and `apps/poller` (the examples are in each `.dev.vars.example`). In production they are stored as Worker secrets (`wrangler secret put`), because a deploy removes text variables set in the Cloudflare dashboard. The web app reads them from the API's `GET /api/features`.

Webhooks also need a `WEBHOOK_MASTER_SECRET` Worker secret of at least 32 characters. Without it the webhook routes answer `503`.

To receive webhooks, see [`docs/webhooks.md`](docs/webhooks.md). The related API routes are in [`docs/api.md`](docs/api.md).

## Stack

| Layer | Technology |
| --- | --- |
| Language | TypeScript, strict mode everywhere |
| Backend | Cloudflare Workers (poller on cron, plus the API) |
| Database | Neon Postgres via Drizzle ORM |
| Frontend | React 18 + Vite, for deployment on Vercel |
| Email | Resend |
| Tests | Vitest, fast-check (property-based) |
| CI | GitHub Actions |

One Vercel Function, the FAA relay, is an approved exception to the Workers-only backend. See [`docs/decisions.md`](docs/decisions.md) and the "FAA relay" section of [`docs/production-runbook.md`](docs/production-runbook.md).

Runtime validation uses Zod. Its approval and the approval of the dev-only accessibility tools (vitest-axe, jsdom, @testing-library/react) are recorded in [`docs/decisions.md`](docs/decisions.md).

## Repository layout

```
packages/core    pure functions: change detector, explanations, schemas, airports
packages/db      Drizzle schema, migrations, repositories
packages/mail    shared Resend client
apps/poller      Worker: 5-minute FAA poll and 30-minute cleanup crons
apps/api         Worker: HTTP API
apps/web         React + Vite frontend
tests/           repo-level tests (repo guard)
docs/            kiro-usage.md, decisions.md, devpost-submission.md, production-runbook.md
```

## Prerequisites

- Node.js (current LTS) and npm. The repo is an npm workspaces monorepo.
- A Neon Postgres database. Free tier is enough.
- A Resend API key, only needed to send real email.
- Wrangler is run through `npx` and installs with the workspace. No global install is needed.

## Install

```powershell
npm install
```

## Environment variables

Copy `.env.example` to `.env` and fill in the values. `.env*` files are gitignored (except `.env.example`). Placeholders only should ever be committed.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon connection string used by the apps, packages/db and drizzle-kit |
| `DATABASE_URL_UNPOOLED` | Direct Neon connection for migrations |
| `RUNTIME_DATABASE_URL` | Least-privilege runtime role (SELECT only on `airports`). Use it as the Workers' `DATABASE_URL` secret |
| `RESEND_API_KEY` | Resend API key |
| `UNSUBSCRIBE_SECRET` | Long random string used to sign unsubscribe links |
| `FRONTEND_URL` | Public web app URL used in emailed links (`http://localhost:5173` locally) |
| `MAIL_FROM` | Sender address, which must be on a verified Resend domain |
| `TEST_DATABASE_URL` | Integration tests only. Use a dedicated, migrated Neon branch, never production |

The Workers don't read `.env`. For local `wrangler dev`, copy each Worker's example file:

```powershell
Copy-Item apps/api/.dev.vars.example apps/api/.dev.vars
Copy-Item apps/poller/.dev.vars.example apps/poller/.dev.vars
```

Then edit both `.dev.vars` files (gitignored). They hold `DATABASE_URL`, `RESEND_API_KEY`, `UNSUBSCRIBE_SECRET`, `FRONTEND_URL` and `MAIL_FROM`. Environment variables are validated with Zod at startup.

### FAA relay variables (optional)

The FAA blocks requests that come from Cloudflare Workers, so the poller can fetch the FAA data through a relay on Vercel. These variables are optional. When they are unset, the poller calls the FAA directly. Placeholders only here, never real values.

| Variable | Where it lives | Purpose |
| --- | --- | --- |
| `FAA_RELAY_URL` | Poller Worker secret (`aerobrief-poller`) | `https://www.aerobriefs.com/api/internal/faa-relay`. Set together with `FAA_RELAY_SECRET`, or not at all |
| `FAA_RELAY_SECRET` | Poller Worker secret (`aerobrief-poller`) | Shared key, at least 32 characters. Sent to the relay in a request header |
| `FAA_RELAY_SECRET` | Vercel project `aero-brief`, Production scope | The same value as on the Worker. The relay rejects calls without it |

Setup, checks and rollback are in the "FAA relay" section of [`docs/production-runbook.md`](docs/production-runbook.md).

## Database: migrate and seed

`drizzle-kit` doesn't load `.env` files, and its config reads `DATABASE_URL` from the shell. Set it to the direct (unpooled) owner URL, then migrate:

```powershell
$env:DATABASE_URL = "<your DATABASE_URL_UNPOOLED value>"
Push-Location packages/db   # the config uses ./src/schema.ts and ./migrations, so run from here
npx drizzle-kit migrate --config drizzle.config.ts
Pop-Location
```

There are seven migrations in `packages/db/migrations/`. `0000` to `0003` are the MVP schema. `0004_webhooks.sql` and `0005_digest.sql` create the Phase 2 tables. `0006_watchlist_cap_30.sql` is on the `phase-2` branch: it raises the watchlist cap in the database trigger from 10 to 30 and adds the 10 Core 30 airports that `0002` did not seed. `0004` to `0006` have not been applied to production, and the owner applies them only after approving them. The command above applies all of them, so run it only against a database you mean to change. For Phase 2 work against a Neon branch, `npm run migrate-phase2` runs the same command with a guard that refuses the production database. `0006` has a reverse script, `packages/db/migrations/down/0006_watchlist_cap_30.down.sql`. The first 20 airports are seeded by migration `0002_seed_airports.sql` and the other 10 by `0006`, so there is no separate seed command. `docs/production-runbook.md` lists the SQL checks and the runtime-role grants.

## Run the tests

```powershell
npm test            # vitest --run: unit tests, fast-check property tests, repo guard, web component and a11y tests
npm run typecheck   # tsc --noEmit for the root and every workspace
```

Property-based tests are the `*.pbt.test.ts` files under `packages/*/test` and `apps/*/test`. They use fast-check and run as part of `npm test`.

To run only the accessibility suite, as CI does:

```powershell
npx vitest --run --project web apps/web/test/a11y
```

Database integration tests live in `packages/db/test/integration` and skip when `TEST_DATABASE_URL` is unset. Set it in your shell to a migrated test branch to run them.

## Run locally

Use three terminals from the repo root. The web dev server proxies `/api` to `http://localhost:8787`, so the API must use that default port.

```powershell
npm run dev -w apps/api       # wrangler dev, API on http://localhost:8787
npm run dev -w apps/web       # vite, web on http://localhost:5173
npm run dev -w apps/poller -- --port 8788   # wrangler dev --test-scheduled
```

The poller doesn't poll on its own under `wrangler dev`. Trigger one cron cycle by hand:

```powershell
curl.exe "http://localhost:8788/__scheduled?cron=*%2F5+*+*+*+*"
```

Warning: with real values in `apps/poller/.dev.vars`, a local poll writes to that database and can send real email. Point `DATABASE_URL` at a test branch if you don't want that.

To build the frontend: `npm run build -w apps/web`.

## Deployment

AeroBrief is live. Deployment, the live smoke test, the Resend domain check and uptime monitoring are done (tasks 13.2 to 13.5; results in [`docs/decisions.md`](docs/decisions.md)).

| Item | URL |
| --- | --- |
| Web app (Vercel) | https://www.aerobriefs.com |
| API (Cloudflare Worker) | https://aerobrief-api.vamegah.workers.dev (also served at https://www.aerobriefs.com/api/ through the Vercel rewrite) |
| Health check (`/api/health`) | https://www.aerobriefs.com/api/health |

The public read-only API is documented in [`docs/api.md`](docs/api.md). Phase 2 webhook receivers are covered in [`docs/webhooks.md`](docs/webhooks.md).

Deployment steps are in [`docs/production-runbook.md`](docs/production-runbook.md). Rotating production secrets is covered in [`docs/secret-rotation.md`](docs/secret-rotation.md).

## How this was built with Kiro

See [`docs/kiro-usage.md`](docs/kiro-usage.md) for how agents, hooks, specs, steering, MCP and property-based testing were used. The Kiro artifacts are in [`.kiro/`](.kiro/):

- `.kiro/specs/aerobrief/`: requirements, design and tasks
- `.kiro/steering/`: product, tech, structure and scope rules
- `.kiro/hooks/`: hook definitions

## Kiroween 2026 submission

The Devpost text, judge testing notes and submission checklist are in [`docs/devpost-submission.md`](docs/devpost-submission.md).

## License

MIT. See [`LICENSE`](LICENSE).
