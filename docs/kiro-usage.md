# How AeroBrief uses Kiro

This document describes what is in the repository today. Each section names the files that back its claims. Where the repo has no evidence of a feature, the section says so.

Status note: deployment (Task 13.2 onward) is not finished. This document links to no deployed URLs.

## Summary

| Area | Evidence in repo | Used? |
| --- | --- | --- |
| Specs | `.kiro/specs/aerobrief/` (requirements, design, tasks) | Yes, central |
| Steering | `.kiro/steering/` (4 files) | Yes |
| Hooks | `.kiro/hooks/` (2 files) | Defined; see caveats |
| Property-based testing | 41 `*.pbt.test.ts` files, fast-check | Yes, central |
| Agents | No `.kiro/agents/` directory or custom agent definitions | No evidence |
| MCP | No readable MCP config in the workspace | No evidence in repo |

## Specs

The whole product was built from one spec, `.kiro/specs/aerobrief/`. Its `.config.kiro` sets `workflowType: requirements-first` and `specType: feature`.

| File | Role |
| --- | --- |
| `requirements.md` | Glossary, assumptions and numbered acceptance criteria (for example 9.10 for event de-duplication, 13.6 for automated accessibility checks, 14.x for stack and scope). |
| `design.md` | Architecture, stack deviations, data model, and 35 numbered correctness properties under "Correctness Properties". |
| `tasks.md` | Ordered implementation plan. Every task cites the requirements it satisfies (`_Requirements: ..._`). Property-test tasks carry a `**Property N: ...**` title and a `**Validates: Requirements ...**` line. |
| `tasks.meta.json` | Kiro's execution history for tasks. |

How the spec shaped the work:

- **Ordering and gating.** `tasks.md` makes Tasks 4, 5 and 6 (poller, change detector, alert engine) a BLOCKING gate. Nothing under `apps/web` could start until Task 7 passed. The `apps/web` directory was created in Task 10.1, after that gate.
- **Approval gate.** Task 1.1 required asking the user before installing anything outside the fixed stack. The answers are recorded in `docs/decisions.md`: Zod and the dev-only test tools (vitest-axe, jsdom, @testing-library/react, @testing-library/dom) approved; Hono not approved, so the API uses a hand-written router.
- **Traceability.** Each property test file begins with a `// Feature: aerobrief, Property N: ...` comment, and the design lists which requirement each property validates.

Status at the time of writing: Tasks 1 to 12 are checked off in `tasks.md`. Task 13 (production verification) is partly done (13.1 only). Task 14 is in progress.

## Steering

Four files in `.kiro/steering/`:

| File | Inclusion | Content |
| --- | --- | --- |
| `tech.md` | `always` | Fixed stack: TypeScript strict, Cloudflare Workers, Neon with Drizzle, React 18 + Vite on Vercel, Resend, Vitest and fast-check, GitHub Actions. Includes a rule to flag any technology outside that list and wait for approval. |
| `structure.md` | `always` | Directory layout, naming, import rules, test layout. Pure logic only in `packages/core`. |
| `scope.md` | `always` | MVP limits: 20 airports, watchlist cap of 10, 24 hour history. Prohibited: scraping third-party sites, FAA SWIM, push, maps, native apps, passwords, monetization. |
| `product.md` | `manual` | Product background, users, tone rules. Loaded only when invoked with `/product`. |

Concrete effects visible in the repo:

- `docs/decisions.md` records each stack deviation request and its outcome, which is the `tech.md` flagging rule in practice. The same file also records the Better Stack or UptimeRobot approval for Task 13.5.
- `design.md` has a "Stack Deviations" table that lists each out-of-stack tool, why it is needed, and the in-stack option considered.
- `tests/repo-guard.test.ts` (Task 1.3) turns steering rules into a failing test: no plain JavaScript source files, `"strict": true` in every tsconfig, no `hono` import, no password column.
- The 20-airport list, 10-airport cap and 24 hour retention appear in `packages/core/src/airports.ts`, the watchlist logic, and the retention functions in `packages/core/src/time.ts`.

## Hooks

Two hook files exist in `.kiro/hooks/`. Both are `askAgent` hooks (they prompt the agent; they do not run scripts).

1. **`lint-on-save.json`** ("Lint on Save"). Trigger: `fileEdited` on `**/*.ts` and `**/*.tsx`. Prompt: run `npx eslint --fix` on the saved file.
2. **`require-test-update.json`** ("Require PBT Update for Schema Changes"). Trigger: `preToolUse` on write tools. Prompt: if the write targets `src/lib/schemas/`, confirm the matching property-based test is updated first.

Known gaps, found while writing this document:

- **The lint hook has no ESLint behind it.** No ESLint config file exists at the repo root, and no `package.json` lists `eslint`. The hook's `npx eslint --fix` call would have nothing configured to run. CI runs `tsc --noEmit` and `vitest`, not ESLint.
- **The schema hook watches paths this repo does not use.** It names `src/lib/schemas/` and `tests/pbt/`. Neither directory exists. Schemas live in `packages/core/src/schemas.ts`, and PBT files live in `packages/core/test/`. As written, the hook never matches a real write.

No evidence in the repo shows either hook firing during development. These two items need fixing (point the hook at `packages/core/src/schemas*` and `packages/core/test/*.pbt.test.ts`, and either add ESLint with approval or remove the lint hook) before this section can claim the hooks protect anything. That is outside Task 14.1, so no change was made here.

## Property-based testing

Property tests use fast-check under Vitest, as `tech.md` requires. The design defines 35 properties, and the repo has 41 `*.pbt.test.ts` files:

| Location | Files |
| --- | --- |
| `packages/core/test/` | 33 |
| `packages/mail/test/` | 1 (`send-email.pbt.test.ts`) |
| `apps/api/test/` | 2 (`history-clamp`, `nationwide-status`) |
| `apps/poller/test/` | 4 (`outcome`, `recipients`, `reprocess`, `stale-gate`) |
| `apps/web/test/` | 1 (display window selection) |

Some properties are split across several files (for example the change detector has eight). Shared generators are in `packages/core/test/arbitraries.ts`.

Examples of what is covered, with the property numbers from `design.md`:

- Property 1, FAA body classification: `faa-body.pbt.test.ts`.
- Property 2 and 3, normalization to exactly 20 airports and the Snapshot JSON round trip: `normalize.pbt.test.ts`, `snapshot-roundtrip.pbt.test.ts`.
- Properties 4 to 10, the change detector (purity, transitions, missing data, self-comparison, started minus ended, ordering, nationwide emission): the `change-detector-*.pbt.test.ts` files.
- Properties 13 to 15 and 35, plain-language explanations: `explain-*.pbt.test.ts`.
- Properties 21 to 23, watchlist invariants, idempotent add and remove: `watchlist-*.pbt.test.ts`.
- Property 26, unsubscribe signature: `unsubscribe.pbt.test.ts`.
- Properties 33 and 34, FAA event ID derivation and snapshot-independent dedupe: `faa-event-id.pbt.test.ts`, `event-key.pbt.test.ts`, `dedupe*.pbt.test.ts`.

Conventions in use: each test carries a `// Feature: aerobrief, Property N: ...` tag, and the Notifier properties run against in-memory fakes rather than a database, as the design states. Example-based unit tests sit next to them (for instance `change-detector.test.ts`, `explain.test.ts`). Database integration tests are separate and skip when no test database URL is set (Task 3.5).

To run everything: `npm test` (runs `vitest --run`). CI runs the same command, plus the accessibility suite and per-workspace typechecks, in `.github/workflows/ci.yml`.

## Agents

There is no `.kiro/agents/` directory and no custom agent definition in the repo. The only Kiro agent behavior with evidence is the spec task execution recorded in `tasks.meta.json` (execution IDs and chat session IDs per task). Nothing further can be claimed here.

## MCP

The repo contains no readable MCP configuration. `.kiro/settings/` exists, but this process could not list it (access denied), and no `mcp.json` was found at `.kiro/settings/mcp.json`.

The only related artifact is a `.neon` file at the repo root holding a Neon organization, project and branch (`production`). It is listed in `.gitignore`. It shows the project was linked to a Neon project, but it does not show how, and nothing in the specs, design or `docs/` describes using an MCP server. Do not read this as evidence of MCP use.

If an MCP server was used during development, add its configuration and a description of what it did, then update this section.

## What this document does not claim

- No deployed API, web or Worker URLs. Task 13.2 to 13.5 are open.
- No demo video, no submission status (Tasks 14.4 and 14.5 are open).
- No claim that the hooks ran, or that any agent or MCP feature was used beyond what is listed above.
