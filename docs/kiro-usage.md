# How AeroBrief uses Kiro

This document answers the Kiroween 2026 write-up questions. It describes what is in the repository today. Each section names the files that back its claims. Where the repo has no evidence of a feature, the section says so.

AeroBrief is live at https://www.aerobriefs.com. Tasks 14.4 (demo video) and 14.5 (repo public, submission) are still open.

## Summary

| Kiroween question | Answer | Evidence |
| --- | --- | --- |
| Kiro IDE, CLI, Web or Crew | Kiro IDE only | No CLI, Web or Crew artifacts in the repo |
| Custom agents | None created | No `.kiro/agents/` directory |
| Agent hooks | 2 defined, both with known gaps, no record of firing | `.kiro/hooks/` |
| Spec-driven development | Central. MVP spec: 18 requirements, 38 properties, 20 task sections. Phase 2 spec: 21 properties, features behind flags | `.kiro/specs/aerobrief/`, `.kiro/specs/aerobrief-phase2/` |
| Steering | 5 files, all `inclusion: always` | `.kiro/steering/` |
| MCP | Neon MCP used for read-only production checks. context7 available, no recorded use | `docs/decisions.md` |
| Property-based testing | 63 `*.pbt.test.ts` files on `main` (44 at the MVP tag), fast-check. One bug caught by a Phase 2 property | `packages/*/test`, `apps/*/test` |
| Kiro powers | None used | See Powers |

## Kiro IDE, CLI, Web, Crew

The project was built in the Kiro IDE only. Nothing in the repo records use of the Kiro CLI, Kiro Web or Crew, so there is no comparison to make between them.

Work ran through the IDE's spec workflow. An orchestrating chat session dispatched one spec-task-execution sub-agent per task and checked the results. `tasks.meta.json` records execution IDs and chat session IDs per task.

Lesson recorded in git history: a sub-agent reported finishing the event card styles (task 17.4), but the CSS had not been written. The orchestrator found this by checking the deployed stylesheet, and commit `a690842` ("Add missing event card styles (task 17.4)") added the missing styles. A sub-agent's report of "done" needed a check against the real output.

## Custom agents

No custom agents were created. `.kiro/` contains `hooks`, `settings` (empty), `specs` and `steering`, and no `agents` directory. The built-in Kiro sub-agents (spec task execution, plus the requirements and design workflow) were used, as described above. Their impact is the per-task dispatch and the spec generation, not anything configured in this repo.

## Hooks

Two hook files exist in `.kiro/hooks/`. Both are `askAgent` hooks (they prompt the agent; they do not run scripts).

1. **`lint-on-save.json`** ("Lint on Save"). Trigger: `fileEdited` on `**/*.ts` and `**/*.tsx`. Prompt: run `npx eslint --fix` on the saved file.
2. **`require-test-update.json`** ("Require PBT Update for Schema Changes"). Trigger: `preToolUse` on write tools. Prompt: if the write targets `src/lib/schemas/`, confirm the matching property-based test is updated first.

Known gaps:

- **The lint hook has no ESLint behind it.** No ESLint config exists at the repo root, and no `package.json` lists `eslint`. CI runs `tsc --noEmit` and `vitest`, not ESLint.
- **The schema hook watches paths this repo does not use.** It names `src/lib/schemas/` and `tests/pbt/`. Neither exists. Schemas live in `packages/core/src/schemas.ts` and PBT files in `packages/core/test/`. As written, the hook never matches a real write.

No evidence in the repo shows either hook firing, and neither automated a workflow that mattered to the build. The process improvements in this project came from the spec, the steering files and the tests, not from hooks. The hooks were committed (`66e1b0e`, "chore: add Kiro agent hooks") and not corrected afterward. Fixing them would mean pointing the schema hook at `packages/core/src/schemas*` and `packages/core/test/*.pbt.test.ts`, and either adding ESLint with approval or removing the lint hook.

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
- Requirement 15 (visual design and product experience) was added after the first deployment. Commit `f62873e` ("Add visual design system (Requirement 15, tasks 16.1-16.21)") added the requirement, the design system section in `design.md`, Property 36 and the `design.md` steering file in one change. The repo does not record why it was added, so none is claimed here. Criterion 15.8 now describes the "N of 10 airports watched" counter and remove-only controls on the Watchlist page, and 15.13 describes the dismissible "Successfully signed in as <email>." message (task 18.4).
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
| `scope.md` | MVP limits: 20 airports, watchlist cap of 10, 24 hour history. Prohibited: scraping third-party sites, FAA SWIM, push, maps, native apps, passwords, monetization. Includes a rule to refuse and explain rather than build a workaround. |
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
- **context7: available, not recorded.** A context7 MCP server was available in the Kiro environment. Nothing in the repo records using it, so no use is claimed.
- No MCP configuration file is in the repo (`.kiro/settings/` is empty), so the server setup is not reproducible from the repository.

What MCP enabled: verifying production state (poller cadence, stored rows, token rows) without a working local database connection. It did not change the code.

## Property-based testing

Property tests use fast-check under Vitest, as `tech.md` requires. The design defines 38 properties. The repo has 44 `*.pbt.test.ts` files:

| Location | Files |
| --- | --- |
| `packages/core/test/` | 35 |
| `packages/mail/test/` | 1 (`send-email.pbt.test.ts`) |
| `apps/api/test/` | 2 (`history-clamp`, `nationwide-status`) |
| `apps/poller/test/` | 4 (`outcome`, `recipients`, `reprocess`, `stale-gate`) |
| `apps/web/test/` | 2 (`display-window`, `sort-airports`) |

Some properties are split across several files (the change detector has eight). Shared generators are in `packages/core/test/arbitraries.ts`.

Requirements using PBT, with property numbers from `design.md`:

- Properties 1 to 3, FAA body classification, normalization to exactly 20 airports, Snapshot JSON round trip (Requirements 1 and 2).
- Properties 4 to 12, the change detector and nationwide status (Requirements 3 and 4).
- Properties 13 to 15 and 35, plain-language explanations (Requirement 5).
- Property 16, staleness threshold and send gate (Requirement 6). Properties 17 and 24 to 27, alert content, recipients, retry bound, unsubscribe signature and one email per user per event (Requirements 5 and 9).
- Properties 18 to 20, magic link validity, rate limit and email validation (Requirement 7). Properties 21 to 23, watchlist invariants and idempotence (Requirement 8).
- Properties 28 to 31, display window, retention partition, age bound after cleanup, history clamping (Requirements 10 and 11).
- Property 32, secrets never reach logs (Requirement 14.10). Properties 33 and 34, event ID derivation and snapshot-independent dedupe (Requirement 9.9 and 9.10).
- Property 36, status table ordering (Requirement 15.6): ground-stop airports first, then ascending airport identifier. Test: `apps/web/test/sort-airports.pbt.test.ts`.
- Property 37, unsubscribe secret acceptance (Requirements 16.7, 16.8, 9.8): the current secret always verifies, the previous secret only before its expiry, and any other secret is rejected. Test: `packages/core/test/unsubscribe-secrets.pbt.test.ts`.
- Property 38, advisory URL acceptance (Requirements 17.4, 17.5): only `https:` URLs on `faa.gov` or a subdomain pass, and look-alike hosts return `null`. Test: `packages/core/test/advisory-url.pbt.test.ts` (task 20.1).

Did PBT catch issues unit tests would miss? In the MVP build the repo records no bug that a property test caught. Searches of `docs/decisions.md`, `tasks.md` and `git log` found none. Phase 2 has one (see "Phase 2: features merged behind flags"). What the properties guard against: duplicate alert emails (Properties 24 to 27, 33, 34), misclassifying a missing airport or a changed Snapshot as an event (Properties 5 to 8), wrong staleness at the 10 minute edge (Property 16), and accepting a forged unsubscribe link or a look-alike advisory host (Properties 26, 37, 38). The one production bug recorded (415 on DELETE, task 18.5) was in the HTTP layer, where no property test existed, and the fix added example-based regression tests.

Unit tests sit next to the property tests (for example `change-detector.test.ts`, `explain.test.ts`). Database integration tests skip when no test database URL is set (Task 3.5). Run everything with `npm test`. CI runs the same, plus the accessibility suite and per-workspace typechecks, in `.github/workflows/ci.yml`.

## Phase 2: features merged behind flags

After the MVP was submitted (tag `mvp-contest-2026`), four additions were built on the `phase-2` branch and merged into local `main`: dark mode (`FEATURE_DARK_MODE`), a high-contrast AAA theme (`FEATURE_HIGH_CONTRAST`), signed webhooks (`FEATURE_WEBHOOKS`) and a daily digest email (`FEATURE_DIGESTS`). Each flag is off by default and none is enabled in production. Production does not have migrations 0004 (webhooks) and 0005 (digest), so turning on `FEATURE_WEBHOOKS` or `FEATURE_DIGESTS` there would fail until they are applied. The other Phase 2 scope items (more airports, paid data providers, SMS, Slack, PagerDuty, billing, single sign-on and the rest) are not built and not merged. This section covers only the four merged features.

What Kiro artifacts back this:

- **A second spec.** `.kiro/specs/aerobrief-phase2/` holds `requirements.md`, `design.md`, `tasks.md` and `tasks.meta.json`. Its `.config.kiro` sets `workflowType: requirements-first`. The design has 21 numbered properties: 1 flag parsing; 2 and 3 theme resolution; 4 theme contrast; 5 allowlist filter; 6 to 10 digest (due selection, idempotency, content, composition, unsubscribe signature); 11 to 14 webhook URL safety, idempotent URL validation, URL masking and secret derivation; 15 to 21 webhook signing, tamper and replay rejection, retry bound, failure counter, payload validity, payload round trip and test-event rate limit. Each property cites the requirements it validates.
- **Steering carried the rules.** `.kiro/steering/scope.md` has a "Phase 2 (branch `phase-2` only)" section. It lists what is in scope on that branch and what stays prohibited (no scraping, push, map view, native apps, passwords or FAA SWIM). It requires a feature flag for every Phase 2 feature, off by default, so that with every flag off the app behaves as `main` did. It requires every schema change to be a separate, reversible migration run only against a Neon branch until merged, and Phase 2 Workers to deploy under separate names. Its "Rule: roll back" says to turn a failed feature's flag off and revert its commits, or delete the branch if the branch as a whole fails. The `tech.md` approval rule still applied.
- **One flag and one contiguous commit range per feature.** After the setup commit `556907b` (flags, `/api/features`, flags-off guards, deploy and migration-target guards), the history has `989708e` (dark mode), `fa2d6fa` (high contrast), `c8bb274` and `95da9f8` (webhooks), and `e5959c3` and `bbd419e` (digest). Because each feature is a contiguous range behind its own flag, the rollback rule can be applied to one feature without touching the others.
- **A separate database branch.** Migrations 0004 and 0005 were applied to a Neon branch named `phase-2` (a copy-on-write child of production), not to production. `docs/decisions.md` records this, including that the copied production users were deleted and two allowlisted test users seeded. Email sending during testing was limited by `SAFE_SEND_MODE` and an allowlist (Property 5).
- **Checkpoints as tasks.** The task list has checkpoint tasks: a regression run with all flags off (5.23), a run of the digest with its flag on (5.24), and an all-flags-on run of the full suite (6.2). `docs/decisions.md` records the 6.2 result: one failing test, caused by the test environment copying `FEATURE_*` process variables into `import.meta.env`, which a guard test rejects. The guard was not weakened.
- **Hooks.** The two hooks in `.kiro/hooks/` were not changed for Phase 2, so the gaps listed under Hooks still apply. Nothing in the repo shows them firing during Phase 2.

Issues caught during the build, from the repo:

- **Property 10 found a non-canonical base64url signature.** `verifyDigestUnsubscribe` decoded the signature with `atob`, which ignores the unused trailing bits of the last character. Two different strings could decode to the same bytes and both verify. The property test produced a counterexample (user `00000000-5f10-6582-8000-001a41acf1c7`, secret `( 60Q`). Commit `bbd419e` made the decoder accept only the canonical encoding. `packages/core/test/digest-unsubscribe.test.ts` keeps the counterexample as a regression test, with a second test for padding, whitespace and non-alphabet characters. The impact was small, since a signature still had to match an HMAC, but a verifier should accept exactly one string per signature.
- **workerd rejected a named export.** Running the digest cron locally with `wrangler dev --test-scheduled` (task 5.22) showed that workerd rejects non-handler named exports from a Worker's main module. The cron constants moved to `apps/poller/src/crons.ts`, and `entry-exports.test.ts` in both Workers now guards the entry files. The same run led to a more useful `digest_run_failed` log (stage, error message and cause, truncated and redacted), and exposed a local `DATABASE_URL` that pointed at a database without migration 0005. See `docs/decisions.md` (2026-11-20) and `docs/digest-local-run.md`.
- **Scope drift in a test file.** The check that MVP tests were unchanged (task 6.1) found 35 added lines in `apps/web/test/components/airport-page.test.tsx`. They came from MVP section 21 (commit `086e681`), not from Phase 2. The project owner accepted the exception, and `docs/decisions.md` records that no MVP test was deleted, skipped or weakened.
- **A task was dropped, not faked.** Task 4.37 (a delivery check against a real Slack workspace) was dropped by the project owner. The webhook payload follows Slack's documented `text` format, but delivery to a real Slack workspace is unverified.

What this does not show: no production run of any Phase 2 feature, and no comparison with building without the spec.

## Powers

No Kiro powers were used to build AeroBrief. The Kiro environment had the postman and terraform powers installed. Neither was used, and the repo contains no Postman collection or Terraform files. Third-party tooling that was used is limited to the dev dependencies and external services recorded in `docs/decisions.md`.

## What this document does not claim

- No comparison of Kiro IDE with CLI, Web or Crew. Only the IDE was used.
- No custom agents. Only built-in Kiro sub-agents were used.
- No claim that the hooks ran or protected anything. Both have known gaps.
- No claim that context7 was used. It was available, and no use is recorded.
- No MVP bug caught by a property test. The one recorded catch is in Phase 2.
- No measured comparison with vibe coding. No vibe-coded version exists.
- No demo video and no submission status (Tasks 14.4 and 14.5 are open).
- No Kiro powers.
