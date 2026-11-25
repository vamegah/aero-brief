# How AeroBrief uses Kiro

This document answers the Kiroween 2026 write-up questions. It describes what is in the repository today. Each section names the files that back its claims. Where the repo has no evidence of a feature, the section says so.

AeroBrief is live at https://www.aerobriefs.com. The Kiroween 2026 submission is `main` as of December 4, 2026, 2:00 PM PT. It includes the four Phase 2 features, which are live in production (all four flags on, verified by the owner on 2026-11-25, with Safe_Send_Mode on), the 30 FAA Core 30 airports with a watchlist of 30 (decided 2026-11-24, see [`docs/decisions.md`](decisions.md)), the redesigned Status dashboard and Settings page, the `ui-improvements` work, and the Vercel relay for the FAA feed. Numbers below that describe the MVP (20 airports, a cap of 10) are history and were true at the `mvp-contest-2026` tag. File counts were taken on 2026-11-25.

## Summary

| Kiroween question | Answer | Evidence |
| --- | --- | --- |
| Kiro IDE, CLI, Web or Crew | Kiro IDE only | No CLI, Web or Crew artifacts in the repo |
| Custom agents | None created | No `.kiro/agents/` directory |
| Agent hooks | 2 defined and rewritten in the current Kiro schema (the first two were broken). The agent's observation of one firing is in "Hooks"; the owner's confirmation is pending | `.kiro/hooks/`, `docs/hooks.md` |
| Spec-driven development | Central. MVP spec: 18 requirements, 38 properties, 20 task sections. Phase 2 spec: 21 properties, features behind flags. Five later specs: FAA relay, UI refresh, Core 30 limits, UI improvements and submission polish | `.kiro/specs/aerobrief/`, `.kiro/specs/aerobrief-phase2/`, `.kiro/specs/faa-403-poller/`, `.kiro/specs/ui-refresh/`, `.kiro/specs/core30-limits/`, `.kiro/specs/ui-improvements/`, `.kiro/specs/submission-polish/` |
| Steering | 5 files, all `inclusion: always` | `.kiro/steering/` |
| MCP | Neon MCP used for the Phase 2 branch and migrations, restore-point branches before production migrations, and read-only production checks. context7 available, no recorded use | `docs/decisions.md`, `docs/phase2-rollout.md` |
| Property-based testing | 85 `*.pbt.test.ts` files in the workspace on 2026-11-25 (44 at the MVP tag), fast-check. Bugs caught by Phase 2 properties, see "Where Kiro surprised us" | `packages/*/test`, `apps/*/test` |
| Kiro powers | None used | See Powers |

## Kiro IDE, CLI, Web, Crew

The project was built in the Kiro IDE only. Nothing in the repo records use of the Kiro CLI, Kiro Web or Crew, so there is no comparison to make between them.

Work ran through the IDE's spec workflow. An orchestrating chat session dispatched one spec-task-execution sub-agent per task and checked the results. `tasks.meta.json` records execution IDs and chat session IDs per task.

Lesson recorded in git history: a sub-agent reported finishing the event card styles (task 17.4), but the CSS had not been written. The orchestrator found this by checking the deployed stylesheet, and commit `a690842` ("Add missing event card styles (task 17.4)") added the missing styles. A sub-agent's report of "done" needed a check against the real output.

## Custom agents

No custom agents were created. `.kiro/` contains `hooks`, `settings` (empty), `specs` and `steering`, and no `agents` directory. The built-in Kiro sub-agents (spec task execution, plus the requirements and design workflow) were used, as described above. Their impact is the per-task dispatch and the spec generation, not anything configured in this repo.

## Hooks

Two hook files exist in `.kiro/hooks/`. Both are agent hooks in the current Kiro schema (`version: "v1"`, a `hooks` array): they inject a prompt into the conversation and do not run scripts. The full description, the steps to make each fire and the firing record are in [`docs/hooks.md`](hooks.md).

1. **`typecheck-on-save.json`** ("Typecheck and test on save"). Trigger: `PostFileSave` on `.ts` and `.tsx` files under `apps/` or `packages/`. Prompt: run `npm run typecheck -w <workspace>` and `npx vitest --run` on the mirrored tests of the saved file, report failures, change nothing else.
2. **`require-test-update.json`** ("Require test update for core logic and schemas"). Trigger: `PostFileSave`, matcher `(^|[\\/])packages[\\/]core[\\/]src[\\/].+\.ts$`. Prompt: after a save under `packages/core/src/`, confirm that the mirrored tests in `packages/core/test/` are updated; for `schemas.ts`, that `schemas.test.ts`, `snapshot-roundtrip.pbt.test.ts` and `faa-body.pbt.test.ts` cover the change. It was changed on 2026-11-25 from `PreToolUse` with matcher `write`, because that version interrupted every write, including docs.

Limits, as stated in `docs/hooks.md`: both hooks are prompts that the agent follows, and neither can block a save (a `PostFileSave` hook runs after the file is written). Both fire on saves made through Kiro, not on a save typed in the editor or a file written by a shell command.

**History.** The first two hooks were broken. They were committed in `66e1b0e` ("chore: add Kiro agent hooks") in an older flat format (`when`, `then`, `toolTypes`), and neither could work in this repository. `lint-on-save.json` ran `npx eslint --fix`, but no ESLint config exists at the repo root, no `package.json` lists `eslint`, and ESLint is outside the approved stack in `tech.md`. `require-test-update.json` watched `src/lib/schemas/` and `tests/pbt/`, which do not exist here (schemas live in `packages/core/src/schemas.ts`, PBT files in `packages/core/test/`), so it never matched a real write. No record shows either of them firing. The `submission-polish` spec (`.kiro/specs/submission-polish/`) replaced them on 2026-11-25: `lint-on-save.json` was deleted, `typecheck-on-save.json` was created, and `require-test-update.json` was rewritten. ESLint was not added.

**Firing.** The agent that edited this document observed the Test_Gate hook fire in a Kiro session on 2026-11-25. It intercepted writes to `docs/kiro-usage.md` before they ran. The agent found that the path was outside `packages/core/src/`, as the hook prompt says to check, and the write then went ahead. This is the agent's observation only. It is not the owner's confirmation. The owner's confirmation for both hooks is pending and is recorded in the "Firing record" table of `docs/hooks.md`. No firing of the Typecheck hook has been observed.

The process improvements in this project came mainly from the spec, the steering files and the tests. The hooks added a reminder, not an enforced check.

## Spec-driven development

One spec, `.kiro/specs/aerobrief/`, drove the whole build. `.config.kiro` sets `workflowType: requirements-first` and `specType: feature`.

| File | Content |
| --- | --- |
| `requirements.md` | 18 numbered requirements with acceptance criteria in EARS form ("WHEN ... THE system SHALL ..."). |
| `design.md` | Architecture, stack deviations, data model, design system, and 38 numbered correctness properties. |
| `tasks.md` | 20 top-level task sections and 139 numbered sub-tasks. Each cites the requirements it satisfies. Property-test tasks carry a `**Validates: Requirements ...**` line. |
| `tasks.meta.json` | Kiro's execution history for tasks. |

How the spec shaped the work:

- **Ordering and gating.** Tasks 4, 5 and 6 (poller, change detector, alert engine) are a BLOCKING gate, and Task 7 is a checkpoint. `apps/web` was created in Task 10.1, after the gate.
- **Approval gate.** Task 1.1 required asking before installing anything outside the fixed stack. `docs/decisions.md` records the answers: Zod and the dev-only test tools approved, Hono not approved, so the API uses a hand-written router.
- **Traceability.** Each property test begins with `// Feature: aerobrief, Property N: ...`, and the design says which requirement each property validates.

How the requirements changed during the project (from `tasks.md`, `design.md` and git history):

- Requirements 1 to 14 and the first 12 task sections were written before any code (commit `769f024`). Deployment and production verification (section 13) followed.
- Requirement 15 (visual design and product experience) was added after the first deployment. Commit `f62873e` ("Add visual design system (Requirement 15, tasks 16.1-16.21)") added the requirement, the design system section in `design.md`, Property 36 and the `design.md` steering file in one change. The repo does not record why it was added, so none is claimed here. Criterion 15.8 describes the "N of 10 airports watched" counter (the cap is now 30, so the counter reads "N of 30 airports watched"; the change is recorded in `docs/decisions.md` and the original spec text is kept as history) and remove-only controls on the Watchlist page, and 15.13 describes the dismissible "Successfully signed in as <email>." message (task 18.4).
- Requirement 16 (rotate secrets safely) added Property 37 and tasks 19.1 to 19.3 (commit `8ba9f87`).
- Requirements 17 (cause, expected end and official source of each ground stop), 18 (24-hour timeline for one airport), 7.11 (privacy notice) and 15.14 (three-level overall status) came from reviewing an outside requirements document. Task section 20 built them: the Snapshot stores the expected end and a checked FAA advisory URL, the API returns them, the status table shows them, and `/airport/<code>` is a new page. `design.md` contains a section, "Not adopted from the outside requirements document", that lists items from an outside requirements document reviewed against `scope.md` and `tech.md`, and why each was left out.

Comparison with vibe coding: the repo contains no vibe-coded version of AeroBrief, so there is no measured comparison. What the spec provided that a chat-only approach would not have: a fixed list of what "done" means per task, a requirement ID on every property test, and a place to record decisions before code existed (for example the Hono refusal). The cost was real: the spec files total roughly 180 KB, and requirements and design needed edits whenever a later task showed a gap.

Lesson recorded in git history: task 18.5. A production bug (HTTP 415 on bodiless DELETE requests behind the Vercel proxy, which broke watchlist Remove and Delete account) was found after deployment. The fix (`1f99f59`) changed how `readBody` decides whether a body is present, and added router regression tests and a design note. The unit tests of the time had not covered a DELETE with no body and no content type.

## Steering

Five files in `.kiro/steering/`, all with `inclusion: always`:

| File | Content |
| --- | --- |
| `tech.md` | Fixed stack. Includes a rule to flag any technology outside it and wait for approval. |
| `structure.md` | Directory layout, naming, import rules, test layout. Pure logic only in `packages/core`. |
| `scope.md` | Limits: the FAA Core 30 airports (30), watchlist cap of 30, 24 hour history. The MVP had 20 airports and a cap of 10. The limits changed on 2026-11-24 (see [`docs/decisions.md`](decisions.md), "Core 30 airports and watchlist of 30"). Prohibited: scraping third-party sites, FAA SWIM, push, maps, native apps, passwords, monetization. Includes a rule to refuse and explain rather than build a workaround. |
| `design.md` | Visual design rules for `apps/web`: tokens, WCAG 2.1 AA, no new runtime dependencies, do not change tested DOM structure. Added with Requirement 15. |
| `product.md` | Product background, users, tone rules. It was `manual` in the first commit and was changed to `always` in commit `8ba9f87`. |

Examples where steering changed an outcome, all recorded in the repo:

- **`scope.md` rejected items from an outside requirements document.** The "Not adopted" table in `design.md` lists all-U.S.-airports (FR-03), push notifications (FR-08), a map view (FR-18), FAA SWIM (FR-07), native apps and FlightAware or ADS-B Exchange as a second source. Each cites the boundary it violates.
- **`design.md` steering forced icons to be CSS masks.** The Task 10.8 test rejects `<svg>` and `<img>` inside `StatusView`, so the steering rule and the design say icons there are `mask-image` data URIs on `aria-hidden` spans, and no class name may contain "map".
- **`tech.md` forced approval for outside tools.** `docs/decisions.md` records Hono refused (hand-written router instead) and an uptime monitor (UptimeRobot or Better Stack, Task 13.5) flagged as a deviation, with the in-stack option considered (a Cloudflare cron ping) and why it was rejected: it runs on the platform it is meant to watch. `design.md` has a "Stack Deviations" table.
- **`structure.md` and `tech.md` became a test.** `tests/repo-guard.test.ts` fails on plain JavaScript source files, a tsconfig without `"strict": true`, a `hono` import, or a password column.

The strategy that mattered most was `inclusion: always` for rules that are short, concrete and checkable (a list of allowed technologies, a list of prohibited features). Rules that could be checked by a test were turned into tests. The one steering file that was initially manual (`product.md`) was changed to always because its tone rules apply to every UI change.

## MCP

- **Neon MCP: used.** `docs/decisions.md` (2026-11-17, "Live smoke test (Task 13.3)") records read-only queries against the production Neon project and branch through the Neon MCP tools. They confirmed consecutive `poll` rows in `job_runs`, the stored `snapshots` rows and the new `magic_links` row. The file also records why: a direct Node connection to Neon from this machine failed with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (likely local TLS interception), so MCP was the working path. This replaces the earlier statement in this document that there was no evidence of MCP use.
- **Neon MCP: Phase 2 branch and migrations.** The `phase-2` branch (`br-odd-feather-bbpy60hl`) was a copy-on-write child of production, and migrations 0004 and 0005 were applied to it with `run_sql_transaction` because the branch has no `__drizzle_migrations` table (`docs/decisions.md`, 2026-11-18 and 2026-11-19). The same file records the read-only count checks after the copied users were deleted.
- **Neon MCP: production migrations with restore points.** Migrations 0004, 0005 and 0006 are applied to production through the Neon MCP, with a restore-point branch taken first: `pre-phase2-2026-11-23` (`br-muddy-glade-bb8m1nrz`) and `pre-core30-2026-11-24` (`br-quiet-cell-bbk67rmf`). This was verified on 2026-11-25. The backup step is `docs/phase2-rollout.md`, step 3a. The branch names and IDs come from that verification (the task brief for this change), not from a file in the repository.
- **context7: available, not recorded.** A context7 MCP server was available in the Kiro environment. Nothing in the repo records using it, so no use is claimed.
- No MCP configuration file is in the repo (`.kiro/settings/` is empty), so the server setup is not reproducible from the repository.

What MCP enabled: verifying production state (poller cadence, stored rows, token rows) without a working local database connection. It did not change the code.

## Property-based testing

Property tests use fast-check under Vitest, as `tech.md` requires. The design defines 38 properties. The repo had 44 `*.pbt.test.ts` files at the MVP tag. The workspace has 85 on 2026-11-25 (recounted with `Get-ChildItem -Recurse -Filter *.pbt.test.ts -File apps,packages,tests`, excluding `node_modules`):

| Location | Files |
| --- | --- |
| `packages/core/test/` | 58 |
| `packages/db/test/` | 1 |
| `packages/mail/test/` | 1 (`send-email.pbt.test.ts`) |
| `apps/api/test/` | 2 (`history-clamp`, `nationwide-status`) |
| `apps/poller/test/` | 7 |
| `apps/web/test/` | 16 |

Some properties are split across several files (the change detector has eight). Shared generators are in `packages/core/test/arbitraries.ts`.

Requirements using PBT, with property numbers from `design.md`:

- Properties 1 to 3, FAA body classification, normalization to exactly 20 airports (30 since 2026-11-24), Snapshot JSON round trip (Requirements 1 and 2).
- Properties 4 to 12, the change detector and nationwide status (Requirements 3 and 4).
- Properties 13 to 15 and 35, plain-language explanations (Requirement 5).
- Property 16, staleness threshold and send gate (Requirement 6). Properties 17 and 24 to 27, alert content, recipients, retry bound, unsubscribe signature and one email per user per event (Requirements 5 and 9).
- Properties 18 to 20, magic link validity, rate limit and email validation (Requirement 7). Properties 21 to 23, watchlist invariants and idempotence (Requirement 8).
- Properties 28 to 31, display window, retention partition, age bound after cleanup, history clamping (Requirements 10 and 11).
- Property 32, secrets never reach logs (Requirement 14.10). Properties 33 and 34, event ID derivation and snapshot-independent dedupe (Requirement 9.9 and 9.10).
- Property 36, status table ordering (Requirement 15.6): ground-stop airports first, then ascending airport identifier. Test: `apps/web/test/sort-airports.pbt.test.ts`.
- Property 37, unsubscribe secret acceptance (Requirements 16.7, 16.8, 9.8): the current secret always verifies, the previous secret only before its expiry, and any other secret is rejected. Test: `packages/core/test/unsubscribe-secrets.pbt.test.ts`.
- Property 38, advisory URL acceptance (Requirements 17.4, 17.5): only `https:` URLs on `faa.gov` or a subdomain pass, and look-alike hosts return `null`. Test: `packages/core/test/advisory-url.pbt.test.ts` (task 20.1).

Did PBT catch issues unit tests would miss? In the MVP build the repo records no bug that a property test caught. Searches of `docs/decisions.md`, `tasks.md` and `git log` found none. Phase 2 has one (Property 10, see "Where Kiro surprised us", item a). Item d there is a second never-throws case in the Poller. What the properties guard against: duplicate alert emails (Properties 24 to 27, 33, 34), misclassifying a missing airport or a changed Snapshot as an event (Properties 5 to 8), wrong staleness at the 10 minute edge (Property 16), and accepting a forged unsubscribe link or a look-alike advisory host (Properties 26, 37, 38). The one production bug recorded (415 on DELETE, task 18.5) was in the HTTP layer, where no property test existed, and the fix added example-based regression tests.

Unit tests sit next to the property tests (for example `change-detector.test.ts`, `explain.test.ts`). Database integration tests skip when no test database URL is set (Task 3.5). Run everything with `npm test`. CI runs the same, plus the accessibility suite and per-workspace typechecks, in `.github/workflows/ci.yml`.

## Phase 2: features behind flags

After the MVP (tag `mvp-contest-2026`), four additions were built on the `phase-2` branch. The Kiroween 2026 submission is `main` as of the deadline and includes them: dark mode (`FEATURE_DARK_MODE`), a high-contrast AAA theme (`FEATURE_HIGH_CONTRAST`), signed webhooks (`FEATURE_WEBHOOKS`) and a daily digest email (`FEATURE_DIGESTS`). In the code each flag is off unless it is set, and the production values are set by the owner.

**Production state, verified 2026-11-25** (checks recorded in the task brief for this change; `main` at `5f19226`):

- `/api/features` returns all four flags `true` in production.
- Migrations 0004 (webhooks), 0005 (digest) and 0006 (Core 30 limits) are applied to the production database through the Neon MCP, each after a restore-point branch: `pre-phase2-2026-11-23` (`br-muddy-glade-bb8m1nrz`) and `pre-core30-2026-11-24` (`br-quiet-cell-bbk67rmf`). The procedure is `docs/phase2-rollout.md`, step 3a (back up first).
- Safe_Send_Mode stays on. Digests and webhooks go only to allowlisted recipients (`packages/core/src/safe-send.ts`). The submission therefore does not claim that every user receives them.

The other Phase 2 scope items (paid data providers, SMS, Slack, PagerDuty, billing, single sign-on and the rest) are not built. The airport list grew only to the FAA Core 30 airports, by the owner's decision of 2026-11-24. This section covers the four flagged features.

What Kiro artifacts back this:

- **A second spec.** `.kiro/specs/aerobrief-phase2/` holds `requirements.md`, `design.md`, `tasks.md` and `tasks.meta.json`. Its `.config.kiro` sets `workflowType: requirements-first`. The design has 21 numbered properties: 1 flag parsing; 2 and 3 theme resolution; 4 theme contrast; 5 allowlist filter; 6 to 10 digest (due selection, idempotency, content, composition, unsubscribe signature); 11 to 14 webhook URL safety, idempotent URL validation, URL masking and secret derivation; 15 to 21 webhook signing, tamper and replay rejection, retry bound, failure counter, payload validity, payload round trip and test-event rate limit. Each property cites the requirements it validates.
- **Steering carried the rules.** `.kiro/steering/scope.md` has a "Phase 2 (branch `phase-2` only)" section. It lists what is in scope on that branch and what stays prohibited (no scraping, push, map view, native apps, passwords or FAA SWIM). It requires a feature flag for every Phase 2 feature, off by default, so that with every flag off the app behaves as `main` did. It requires every schema change to be a separate, reversible migration run only against a Neon branch until merged, and Phase 2 Workers to deploy under separate names. Its "Rule: roll back" says to turn a failed feature's flag off and revert its commits, or delete the branch if the branch as a whole fails. The `tech.md` approval rule still applied.
- **One flag and one contiguous commit range per feature.** After the setup commit `556907b` (flags, `/api/features`, flags-off guards, deploy and migration-target guards), the history has `989708e` (dark mode), `fa2d6fa` (high contrast), `c8bb274` and `95da9f8` (webhooks), and `e5959c3` and `bbd419e` (digest). Because each feature is a contiguous range behind its own flag, the rollback rule can be applied to one feature without touching the others.
- **A separate database branch.** Migrations 0004 and 0005 were first applied to a Neon branch named `phase-2` (a copy-on-write child of production), and only later to production (see "Production state" above). `docs/decisions.md` records the branch work, including that the copied production users were deleted and two allowlisted test users seeded. Email sending during testing was limited by `SAFE_SEND_MODE` and an allowlist (Property 5).
- **Checkpoints as tasks.** The task list has checkpoint tasks: a regression run with all flags off (5.23), a run of the digest with its flag on (5.24), and an all-flags-on run of the full suite (6.2). `docs/decisions.md` records the 6.2 result: one failing test, caused by the test environment copying `FEATURE_*` process variables into `import.meta.env`, which a guard test rejects. The guard was not weakened.
- **Hooks.** The two hooks in `.kiro/hooks/` were not changed during Phase 2 and were broken then (see "Hooks"). Nothing in the repo shows them firing during Phase 2. They were fixed afterwards by the `submission-polish` spec.

Issues caught during the build, from the repo:

- **Property 10 found a non-canonical base64url signature.** `verifyDigestUnsubscribe` decoded the signature with `atob`, which ignores the unused trailing bits of the last character. Two different strings could decode to the same bytes and both verify. The property test produced a counterexample (user `00000000-5f10-6582-8000-001a41acf1c7`, secret `( 60Q`). Commit `bbd419e` made the decoder accept only the canonical encoding. `packages/core/test/digest-unsubscribe.test.ts` keeps the counterexample as a regression test, with a second test for padding, whitespace and non-alphabet characters. The impact was small, since a signature still had to match an HMAC, but a verifier should accept exactly one string per signature.
- **workerd rejected a named export.** Running the digest cron locally with `wrangler dev --test-scheduled` (task 5.22) showed that workerd rejects non-handler named exports from a Worker's main module. The cron constants moved to `apps/poller/src/crons.ts`, and `entry-exports.test.ts` in both Workers now guards the entry files. The same run led to a more useful `digest_run_failed` log (stage, error message and cause, truncated and redacted), and exposed a local `DATABASE_URL` that pointed at a database without migration 0005. See `docs/decisions.md` (2026-11-20) and `docs/digest-local-run.md`.
- **Scope drift in a test file.** The check that MVP tests were unchanged (task 6.1) found 35 added lines in `apps/web/test/components/airport-page.test.tsx`. They came from MVP section 21 (commit `086e681`), not from Phase 2. The project owner accepted the exception, and `docs/decisions.md` records that no MVP test was deleted, skipped or weakened.
- **A task was dropped, not faked.** Task 4.37 (a delivery check against a real Slack workspace) was dropped by the project owner. The webhook payload follows Slack's documented `text` format, but delivery to a real Slack workspace is unverified.

What this does not show: a comparison with building without the spec, delivery to a real Slack workspace (task 4.37 was dropped), and any send to a non-allowlisted recipient (Safe_Send_Mode is on).

## Later specs

Five specs were added after the Phase 2 spec (the fifth is `submission-polish`, described last). Each has its own `requirements.md` or `bugfix.md`, `design.md` and `tasks.md` under `.kiro/specs/`, and each decision is in `docs/decisions.md`.

- **`faa-403-poller`.** The FAA answers Cloudflare Workers with HTTP 403. The fix is one Vercel Function, `apps/web/api/internal/faa-relay.ts`, that fetches only the fixed FAA URL for the Poller. `tech.md` lists it as the single approved exception (approved 2026-11-22). See `docs/production-runbook.md`, "FAA relay".
- **`ui-refresh`.** The Status dashboard (Overview, Events and Airports sections) and the Settings page (Display, Daily digest, Webhooks and Account sections, with deep links such as `/settings#webhooks`). Decisions D1 to D11 are in `docs/decisions.md` (2026-11-24).
- **`core30-limits`.** Moves the monitored list from 20 airports to the FAA Core 30 and the watchlist cap from 10 to 30 (owner decision, 2026-11-24). It adds migration `0006_watchlist_cap_30.sql` with a down file, and a pure step in `packages/core` that completes old 20-airport snapshots so the Poller keeps working during the switch. No feature flag: the limits are core product limits. Rollback is `git revert` and then the down file.
- **`ui-improvements`.** The owner supplied a 17-requirement document for the product experience (recovery-aware status, one card per incident, structured explanations, a signed-out watchlist, the Airports view, time display, freshness, filters and search, Settings structure, navigation, footer, accessibility and more). `.kiro/specs/ui-improvements/requirements.md` marks every criterion with one of three dispositions, so nothing was silently dropped:
  - **Build now**: for example the Overview and Network_Summary, one Incident_Card per incident, the five labeled explanation fields, the signed-out Watchlist stored in the browser, the freshness indicator, the time display setting, filters and search kept in the URL, the footer, and navigation that works at 320 px.
  - **Deferred**, each with a reason: Minor Impact and Disrupted statuses, delay program and closure incidents (event types are not tracked), table grouping, the watch star and sortable headers (the airport table markup is fixed by `.kiro/steering/design.md`), the Operations_View and "View source" (the product is traveler view only), 7 and 30 day history (`scope.md` keeps 24 hours), hourly strips and the digest preview with time zone (needs a migration), automated screenshots (Playwright is outside `tech.md`), and the organization and single sign-on scaffolding.
  - **Out of scope**: the map view (criteria 10.1, 10.2 and 10.5), because `scope.md` prohibits it.

  The spec adds no database migration. One additive API field, `incidentKey`, exposes the existing `events.eventKey` column (task 3.1 in `.kiro/specs/ui-improvements/tasks.md`). Its `tasks.md` notes say the design has 18 correctness properties.
- **`submission-polish`.** This spec fixed the two hooks and brought `docs/hooks.md`, this file, `docs/demo-script.md` and `docs/devpost-submission.md` in line with the live product. It changes no application code. Its design records the hook schema finding (`.kiro/specs/submission-polish/design.md`, "Hook schema: finding and decision").

## Where Kiro surprised us

Six cases where the result differed from what the spec or the task report led us to expect. Each cites the evidence in the repository.

**(a) A property found a second string for one signature.** Property 10 of the Phase 2 spec says a digest unsubscribe signature verifies for exactly one string. The HMAC check alone was expected to guarantee that. The property test produced a counterexample (user `00000000-5f10-6582-8000-001a41acf1c7`, secret `( 60Q`). The decoder used `atob`, which ignores the unused trailing bits of the last base64url character, so two strings decoded to the same bytes. Evidence: commit `bbd419e` (changes `packages/core/src/digest/unsubscribe.ts`, adds regression tests to `packages/core/test/digest-unsubscribe.test.ts`) and the account under "Phase 2". The impact was small, because a signature still had to match an HMAC.

**(b) The FAA answered Cloudflare with HTTP 403, and a probe settled it.** The production poller stored no Snapshot because the FAA returned 403. The first hypothesis was missing request headers. A throwaway probe Worker called the FAA URL three ways from Cloudflare colo DFW on 2026-11-21 (no headers, the AeroBrief `User-Agent`, a browser-like `User-Agent`). All three got 403 with an "Access Denied" page, so headers were ruled out. The same URL returned 200 from the owner's machine. A second probe on a Vercel Preview of `phase-2` reached the FAA and got HTTP 200 with JSON, so the fix is one Vercel Function that relays the fixed FAA URL. That is outside `tech.md`, so it was flagged and the owner approved it on 2026-11-22. Evidence: `.kiro/specs/faa-403-poller/probe-result.md`, `.kiro/specs/faa-403-poller/relay-probe-result.md`, `docs/decisions.md` (2026-11-22) and the approved exception in `.kiro/steering/tech.md`.

**(c) A sub-agent reported a task as finished when it was not.** The sub-agent for task 17.4 (event card styles) reported it done, but the CSS had not been written. The orchestrator found the gap by checking the deployed stylesheet. Evidence: commit `a690842` ("Add missing event card styles (task 17.4)"), which adds 61 lines to `apps/web/src/index.css`.

**(d) A thrown value could break the code that reports errors.** `fetchFaa` must never throw. A thrown object whose `toString` is not a function (`{ toString: "" }`), or whose `message` getter throws, could make the error-description code throw. The fix added `safeString` and `readStringProp` to `apps/poller/src/faa-client.ts`, and `describeError` in `apps/poller/src/poll.ts` has a matching regression test. Tests: "does not throw when the thrown object has a non-callable toString" and "describeError does not throw for a non-callable toString or a throwing message getter" in `apps/poller/test/faa-client.test.ts`. The fix is in commit `3527e43`, found with `git log --oneline -S safeString -- apps/poller/src/faa-client.ts`. That commit is the Core 30 change, and its message does not mention this fix. The repository also has a property test for the contract, "never throws and always returns a typed result, for any status, body or thrown value" (`apps/poller/test/faa-client.pbt.test.ts`, with `fc.anything()` for the thrown value). Which test first exposed the bug is not recorded in the repository.

**(e) A CSS rule lost a specificity contest on a phone.** The owner's phone screenshots showed clipped Add and Remove buttons in the stacked table layout (640 px and below). The wide-screen rule sets `width: 1%` with higher specificity than the reset in the narrow block, so the reset never applied. Evidence: commit `5f19226` (a 7-line rule in `apps/web/src/styles/tables.css` with a comment on the cause, and a test in `apps/web/test/layout-css.test.ts`). The screenshots themselves are not in the repository; `docs/responsive-check.md` records that no screenshots are kept.

**(f) The frontend was ahead of the API.** The new web code paired an incident's start and end events by an `incidentKey` field, which the production API did not return yet. The fix is a backward-compatible fallback that pairs events by airport when `incidentKey` is missing. Evidence: commit `9074304` ("Web: accept events without incidentKey and pair them by airport (works with the current production API)"), with `apps/web/src/lib/fallback-incident-keys.ts`, a unit test and a property test (`apps/web/test/fallback-incident-keys.pbt.test.ts`). The field itself comes from task 3.1 of `.kiro/specs/ui-improvements/tasks.md`.

## Powers

No Kiro powers were used to build AeroBrief. The Kiro environment had the postman and terraform powers installed. Neither was used, and the repo contains no Postman collection or Terraform files. Third-party tooling that was used is limited to the dev dependencies and external services recorded in `docs/decisions.md`.

## What this document does not claim

- No comparison of Kiro IDE with CLI, Web or Crew. Only the IDE was used.
- No custom agents. Only built-in Kiro sub-agents were used.
- No claim that the hooks protected anything. Both are prompts that do not block a write. One firing of the Test_Gate hook was observed by the agent in a Kiro session on 2026-11-25. The owner's confirmation of both hooks is pending (`docs/hooks.md`, "Firing record"), and no firing of the Typecheck hook is recorded.
- No claim that context7 was used. It was available, and no use is recorded.
- No MVP bug caught by a property test. The recorded catch is in Phase 2 (item a).
- No claim that a property test found the bug in item d. Which test exposed it first is not recorded.
- No claim that digests or webhooks reach users outside the allowlist. Safe_Send_Mode is on.
- No delivery check against a real Slack workspace (task 4.37 was dropped).
- No measured comparison with vibe coding. No vibe-coded version exists.
- No Kiro powers.
