# AeroBrief

AeroBrief watches FAA airport status and sends plain-language email alerts when a ground stop starts or ends at an airport you follow. It also raises a "system-wide disruption" notice when ground stops affect three or more FAA centers (ARTCCs) at once.

Every explanation is written in plain English, so a traveler doesn't need to read FAA jargon.

## MVP scope

These limits are fixed for the MVP:

- Exactly 20 hardcoded US airports are monitored (`packages/core/src/airports.ts`).
- A watchlist holds at most 10 airports.
- History retention is 24 hours.
- Not included: FAA SWIM, scraping third-party sites, push notifications, a map view, native apps, passwords (sign-in is by emailed magic link) and monetization.

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

## Database: migrate and seed

`drizzle-kit` doesn't load `.env` files, and its config reads `DATABASE_URL` from the shell. Set it to the direct (unpooled) owner URL, then migrate:

```powershell
$env:DATABASE_URL = "<your DATABASE_URL_UNPOOLED value>"
npx drizzle-kit migrate --config packages/db/drizzle.config.ts
```

There are four migrations in `packages/db/migrations/`. The 20 airports are seeded by migration `0002_seed_airports.sql`, so there is no separate seed command. `docs/production-runbook.md` lists the SQL checks and the runtime-role grants.

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
