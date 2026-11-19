---
inclusion: always
---
<!------------------------------------------------------------------------------------
   Add rules to this file or a short description and have Kiro refine them for you.
   
   Learn about inclusion modes: https://kiro.dev/docs/steering/#inclusion-modes
-------------------------------------------------------------------------------------> 
# Project Structure: AeroBrief

## Directory Layout
aerobrief/
├── .kiro/
│ ├── steering/ # product.md, tech.md, structure.md, scope.md
│ ├── specs/aerobrief/ # requirements.md, design.md, tasks.md
│ └── hooks/ # *.json hook definitions
├── packages/
│ ├── core/ # pure functions only: change detector, dedupe, translation rules, Zod schemas
│ │ ├── src/
│ │ └── test/ # Vitest unit tests and fast-check *.pbt.test.ts
│ ├── db/ # Drizzle schema, migrations, seed scripts
│ └── webhook-sender/ # signed webhook sender: side effects allowed, fetch injected; imported by apps/api and apps/poller, never by apps/web or packages/core
├── apps/
│ ├── poller/ # Cloudflare Worker cron entry + FAA fetch logic
│ ├── api/ # Worker API routes and middleware
│ └── web/ # React frontend (components, pages, hooks); added later
├── tests/ # repo-level tests (e.g. repo guard)
├── docs/
│ └── kiro-usage.md
└── README.md


## Where Things Belong
- **Pure business logic goes in `packages/core/`** — no I/O, no network, no database calls. Change detection, dedupe, and translation rules must be testable without mocks.
- **Side effects stay at the edges** — `apps/poller/` does the fetching, `packages/db/` does the persistence (Drizzle), `apps/api/` does the serving. `packages/core` never imports from these.
- **Zod schemas live in `packages/core/src/schemas/`** and are the single source of truth for data shapes. Types are inferred from schemas, never hand-written separately.
- **React components in `apps/web/src/components/`, page-level views in `apps/web/src/pages/`.** No business logic in components — call the API.

## Naming Conventions
- Files: `kebab-case.ts` (e.g. `change-detector.ts`, `alert-engine.ts`)
- React components: `PascalCase.tsx` (e.g. `AirportCard.tsx`)
- Zod schemas: `camelCaseSchema` (e.g. `faaEventSchema`)
- Types: `PascalCase` and suffixed where useful (e.g. `GroundStopEvent`, `PollSnapshot`)
- DB tables: `snake_case` (e.g. `alert_log`, `subscriptions`)

## Import Rules
- Use workspace package names (`@aerobrief/core`, `@aerobrief/db`) or path aliases — never relative paths that climb more than one level (`../../`)
- `packages/core` may import only from itself
- `apps/web` must not import from `apps/poller` or `packages/db` — go through the API
- No circular imports; if one appears, the layering is wrong

## Testing Conventions
- Tests live in `packages/<pkg>/test/` and `apps/<app>/test/`
- Unit tests mirror source paths: `packages/core/src/change-detector.ts` → `packages/core/test/change-detector.test.ts`
- PBT tests mirror source paths: `packages/core/src/dedupe.ts` → `packages/core/test/dedupe.pbt.test.ts`
- Every pure function in `packages/core/src/` has at least one test before its task is marked done

## Configuration
- Environment variables are read only in `apps/*` and `packages/db` — never in `packages/core` or components
- All env vars are validated at startup with Zod and listed in `.env.example`