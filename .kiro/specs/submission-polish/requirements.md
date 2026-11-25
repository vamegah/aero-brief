# Requirements Document

## Introduction

This spec covers the pre-recording polish of the Kiroween 2026 submission. The owner approved the scope on 2026-11-25. The work changes two Kiro hook files and four documents. It changes no application code, no dependency and no database.

The judging rubric has five equal criteria: Potential Impact, Technological Implementation, Design, Innovation and Presentation. Judges ask to see how specs, steering and hooks were used. Today the two hooks in `.kiro/hooks/` are broken (documented in `docs/kiro-usage.md`, "Hooks", and in `docs/kiro-audit.md`, gaps 3, 4 and 5), and the docs still say that the Phase 2 flags are off in production and that the demo video is the pre-redesign flow.

**Facts the work rests on.**

- All four Phase 2 flags are ON in production. The owner verified this on 2026-11-25: `/api/features` returns all four values `true`.
- Migrations 0004, 0005 and 0006 are applied to the production database, each with a Neon restore point.
- Safe_Send_Mode stays ON in production. Digests and webhooks go only to allowlisted recipients.
- ESLint is not installed and is outside the approved stack (`.kiro/steering/tech.md`). The lint hook cannot be repaired by adding it.
- The current Kiro hook schema (checked 2026-11-25 against https://kiro.dev/docs/hooks/ and https://kiro.dev/docs/ide/whats-new-v1/hooks/) is a `version: "v1"` file with a `hooks` array. The two existing files use the older flat format (`when`, `then`, `toolTypes`). `design.md` records the finding and the decision.

**Out of scope.** Application features, a map view, an airport detail redesign, delays or closures, Terms and Privacy pages, ESLint, any new dependency, any change under `.kiro/specs/` other than this spec, and any commit or push. The owner commits.

## Glossary

- **Hook_Files**: The two JSON files in `.kiro/hooks/` after this change: `typecheck-on-save.json` and `require-test-update.json`.
- **Typecheck_Hook**: The hook defined in `typecheck-on-save.json`. It replaces `lint-on-save.json`.
- **Test_Gate_Hook**: The hook defined in `require-test-update.json`.
- **Hooks_Doc**: The new file `docs/hooks.md`.
- **Kiro_Usage_Doc**: `docs/kiro-usage.md`.
- **Demo_Script**: `docs/demo-script.md`.
- **Devpost_Copy**: `docs/devpost-submission.md`.
- **Mirror_Test**: The Vitest file that mirrors a source file under the rule in `.kiro/steering/structure.md`: `packages/<pkg>/src/<name>.ts` maps to `packages/<pkg>/test/<name>.test.ts` and `<name>.pbt.test.ts`, and the same for `apps/<app>`.
- **Affected_Workspace**: The first two path segments of an edited file (for example `packages/core` or `apps/api`).
- **Safe_Send_Mode**: The production setting that limits digests and webhooks to allowlisted recipients (`packages/core/src/safe-send.ts`).
- **Built_Feature**: A feature present on `main` and visible on https://www.aerobriefs.com.
- **Evidence_Citation**: A file path or a commit hash that backs a claim.
- **Owner**: The project owner, who performs the tasks marked needs user action.

## Requirements

### Requirement 1: Typecheck and test on save

**User Story:** As the Owner, I want a hook that checks my TypeScript edits, so that judges see a hook that does real work in this repository.

#### Acceptance Criteria

1. THE Hook_Files SHALL include `typecheck-on-save.json` in the current Kiro hook schema (`version` `"v1"` and a `hooks` array), and THE repository SHALL NOT contain `lint-on-save.json` after the change.
2. WHEN the agent saves a `.ts` or `.tsx` file under `apps/` or `packages/`, THE Typecheck_Hook SHALL ask the agent to run `npm run typecheck -w <Affected_Workspace>`.
3. WHEN the agent saves a `.ts` or `.tsx` file under `apps/` or `packages/`, THE Typecheck_Hook SHALL ask the agent to run `npx vitest --run` on each existing Mirror_Test of the saved file.
4. IF a saved file has no Mirror_Test by name, THEN THE Typecheck_Hook SHALL ask the agent to find test files that import the saved module and run those.
5. IF the typecheck or a test fails, THEN THE Typecheck_Hook SHALL ask the agent to report each failure with its file and message and to make no other change.
6. THE Typecheck_Hook SHALL NOT invoke ESLint and SHALL NOT require a new dependency.
7. WHEN the saved file is under `node_modules`, `dist` or `.wrangler`, THE Typecheck_Hook SHALL ask the agent to do nothing.

### Requirement 2: Test update gate for pure logic and schemas

**User Story:** As the Owner, I want a hook that checks the mirrored tests before pure logic changes, so that the rule in `structure.md` is enforced by Kiro.

#### Acceptance Criteria

1. THE Test_Gate_Hook SHALL use the trigger `PreToolUse` with the matcher `write`, in the current Kiro hook schema.
2. WHEN the agent is about to write a file under `packages/core/src/`, THE Test_Gate_Hook SHALL ask the agent to confirm that the Mirror_Test files in `packages/core/test/` are updated, or are updated in the same task, for the change.
3. WHEN the agent is about to write `packages/core/src/schemas.ts`, THE Test_Gate_Hook SHALL ask the agent to confirm that `schemas.test.ts`, `snapshot-roundtrip.pbt.test.ts` and `faa-body.pbt.test.ts` in `packages/core/test/` cover the change.
4. WHEN the agent is about to write a file outside `packages/core/src/`, THE Test_Gate_Hook SHALL ask the agent to take no action.
5. IF the agent cannot confirm that the mirrored tests cover the change, THEN THE Test_Gate_Hook SHALL ask the agent to update or create the tests first, and to stop and tell the user why when that is not possible.
6. THE Test_Gate_Hook SHALL NOT refer to `src/lib/schemas/` or `tests/pbt/`.

### Requirement 3: Hook documentation and evidence

**User Story:** As a judge, I want to see what each hook does and how to see it fire, so that I can verify that hooks were used.

#### Acceptance Criteria

1. THE Hooks_Doc SHALL describe each of the two hooks: its file, trigger, matcher, what the agent is asked to do, and the limits of the hook.
2. THE Hooks_Doc SHALL state that the Test_Gate_Hook is an agent prompt and does not block a write, and that the Typecheck_Hook fires on file saves made by the agent.
3. THE Hooks_Doc SHALL give the exact steps to make each hook fire and the text to look for in the Kiro Agent Hooks panel and chat, for use in the demo video.
4. THE Hooks_Doc SHALL contain a table "Firing record" with one row per hook and the columns date, what was done, and result, left blank until the Owner completes Task 6.
5. THE design document SHALL cite the Kiro hook documentation URLs used to confirm the schema fields.

### Requirement 4: Accurate Kiro usage write-up

**User Story:** As a judge, I want the Kiro write-up to match the repository, so that I can trust each claim.

#### Acceptance Criteria

1. THE Kiro_Usage_Doc SHALL list the `ui-improvements` spec under "Later specs" with its dispositions (Build now, Deferred, Out of scope) taken from `.kiro/specs/ui-improvements/requirements.md`.
2. THE Kiro_Usage_Doc SHALL state in its Phase 2 section that all four flags are on in production (verified 2026-11-25), that migrations 0004, 0005 and 0006 are applied to production with Neon restore points, and that Safe_Send_Mode stays on.
3. THE Kiro_Usage_Doc SHALL describe the fixed hooks in its Hooks section and SHALL keep the history that the original two hooks were broken until this change.
4. THE Kiro_Usage_Doc SHALL contain a section "Where Kiro surprised us" with these six items, each with at least one Evidence_Citation: (a) Property 10 and the non-canonical base64url unsubscribe signature (commit `bbd419e`); (b) the FAA 403 probe Worker and the Vercel relay (`.kiro/specs/faa-403-poller/probe-result.md`, `relay-probe-result.md`); (c) a sub-agent reported task 17.4 as finished when it was not (commit `a690842`); (d) the property tests that found the `fetchFaa` never-throws bug with a non-callable `toString`; (e) the CSS specificity bug in the stacked table layout found from the Owner's phone screenshots (commit `5f19226`); (f) the frontend and API version skew over `incidentKey` fixed with a backward-compatible fallback (commit `9074304`).
5. THE Kiro_Usage_Doc SHALL describe the use of the Neon MCP for migrations, restore-point branches and read-only production checks, each with an Evidence_Citation.
6. IF a claim in the Kiro_Usage_Doc has no Evidence_Citation, THEN THE author SHALL remove the claim or mark it "not recorded in the repository".
7. THE Kiro_Usage_Doc SHALL NOT state that the Phase 2 flags are off by default in production, and SHALL NOT state that the demo video and the submission are open tasks once the Owner has recorded them.

### Requirement 5: Demo script for an end-to-end video

**User Story:** As the Owner, I want a shot list for one recording, so that the video shows the working product and the Kiro story in about three minutes.

#### Acceptance Criteria

1. THE Demo_Script SHALL give a shot table with, for each shot, the time range, what is on screen, the narration line and what to have open before recording.
2. THE Demo_Script SHALL cover in this order: the problem hook, the Overview headline and chips, an expanded incident card with the structured explanation, the freshness chip, the Airports search by city, the Watchlist without an account then sign-in and the merge offer, Settings (digest, webhooks test event, display and time preference), the phone layout, the Kiro story, and the closing pitch.
3. THE Demo_Script SHALL cover in the Kiro story: the spec list, the steering files, a hook firing, the Neon MCP, a property test and one or two items from "Where Kiro surprised us".
4. THE Demo_Script SHALL show only Built_Features and SHALL NOT show a map, an airport detail redesign, delays or closures, or Terms and Privacy pages.
5. THE Demo_Script SHALL total about three minutes and SHALL tell the Owner to check the maximum video length in the Devpost rules before recording.
6. WHILE Safe_Send_Mode is on, THE Demo_Script SHALL tell the Owner to sign in with an allowlisted address for the digest and webhook shots.
7. THE Demo_Script SHALL keep the stale-banner method and the YouTube upload notes of the previous version, updated for the shots above.

### Requirement 6: Matching Devpost copy

**User Story:** As a judge, I want the submission text to match the live product, so that what I read is what I see.

#### Acceptance Criteria

1. THE Devpost_Copy SHALL state that all four Phase 2 features are live on https://www.aerobriefs.com with Safe_Send_Mode on, and SHALL NOT state that any of them is off by default in production.
2. THE Devpost_Copy SHALL describe the UI improvements: Overview, incident cards, structured explanations, the freshness chip, the time display setting, the signed-out Watchlist, the navigation and the footer.
3. THE Devpost_Copy SHALL state the 30 FAA Core 30 airports and the FAA relay on Vercel with its approval.
4. THE Devpost_Copy SHALL tell the Kiro story with specs, steering, hooks, MCP and property tests, and SHALL include at least two items from "Where Kiro surprised us".
5. THE Devpost_Copy SHALL list "What's next" from the Deferred dispositions in `.kiro/specs/ui-improvements/requirements.md` and from `docs/decisions.md`, and SHALL NOT list a feature that is built.
6. THE Devpost_Copy SHALL give a count of `*.pbt.test.ts` files that matches the repository on the day of the change.
7. THE Devpost_Copy SHALL update the judge testing notes for the freshness chip and the signed-out Watchlist.

### Requirement 7: Verification and owner confirmation

**User Story:** As the Owner, I want proof that the repository still passes and that each hook fires, so that I can state both in the submission.

#### Acceptance Criteria

1. WHEN all implementation tasks are done, THE checkpoint SHALL run `npm test` and `npm run typecheck` and SHALL report the counts of passed tests and the exit codes.
2. WHEN all implementation tasks are done, THE checkpoint SHALL parse each file in Hook_Files as JSON and SHALL check `version` equals `"v1"`, `hooks` is a non-empty array, and each hook has `name`, `trigger` and `action`.
3. THE checkpoint SHALL confirm that no file outside `.kiro/hooks/`, `.kiro/specs/submission-polish/` and `docs/` changed.
4. WHEN the Owner edits a file in `packages/core/src/` through the agent, THE Typecheck_Hook SHALL fire, and the Owner SHALL record the result in the Hooks_Doc.
5. WHEN the agent attempts a write to `packages/core/src/schemas.ts`, THE Test_Gate_Hook SHALL fire, and the Owner SHALL record the result in the Hooks_Doc.
6. IF a hook does not fire in the Owner's Kiro version, THEN THE Owner SHALL record the Kiro version and report it, and THE Hooks_Doc SHALL NOT claim that the hook fires.
