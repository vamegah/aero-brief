# Kiro hooks

## Purpose

AeroBrief has two Kiro agent hooks in `.kiro/hooks/`. They tie the repository's own rules to the agent's edits: typecheck and test what the agent saves, and check that tests are updated after it saves pure logic. Both use the current Kiro hook schema (`version: "v1"` and a `hooks` array). Both are agent actions: they inject a prompt into the conversation.

Status: the files are written and parse as JSON. Both hooks have a row in the "Firing record" table showing they fired on 2026-11-25, confirmed by the owner.

## Hook 1: Typecheck and test on save

| Item | Value |
| --- | --- |
| File | `.kiro/hooks/typecheck-on-save.json` |
| Trigger | `PostFileSave` |
| Matcher | `(^|[\\/])(apps|packages)[\\/].+\.tsx?$` (regex on the file path; `/` or `\`) |
| Action | `agent` prompt |

What the agent is asked to do after saving a `.ts` or `.tsx` file under `apps/` or `packages/`:

1. Do nothing if the path contains `node_modules`, `dist` or `.wrangler`.
2. Run `npm run typecheck -w <first two path segments>` (for example `packages/core`).
3. Run `npx vitest --run` on the mirrored tests: `<ws>/test/<name>.test.ts` and `<name>.pbt.test.ts` for `<ws>/src/<name>.ts`, per `.kiro/steering/structure.md`. If no mirror exists by name, find test files in the same workspace that import the saved module.
4. If anything fails, report each failure with its file and message. Change nothing else. Do not run ESLint.

Limits:

- `PostFileSave` fires when the agent saves or modifies a file. A save you type yourself in the editor is not documented to trigger it.
- The hook is a prompt. The agent can skip or misread it, and nothing enforces the result.
- A workspace without a `typecheck` script makes the command fail. The agent should then report it and run the root `npm run typecheck`.
- Test files match the matcher, so editing a test runs that test.

## Hook 2: Require test update for core logic and schemas

| Item | Value |
| --- | --- |
| File | `.kiro/hooks/require-test-update.json` |
| Trigger | `PostFileSave` |
| Matcher | `(^|[\\/])packages[\\/]core[\\/]src[\\/].+\.ts$` (regex on the file path; `/` or `\`) |
| Action | `agent` prompt |

What the agent is asked to do after saving a `.ts` file under `packages/core/src/` (the matcher restricts the hook to those paths, so the prompt has no "skip other paths" branch):

- Confirm the mirrored tests in `packages/core/test/` (`<name>.test.ts`, `<name>.pbt.test.ts`) are updated for the change.
- Saved file is `packages/core/src/schemas.ts`: confirm that `schemas.test.ts`, `snapshot-roundtrip.pbt.test.ts` and `faa-body.pbt.test.ts` cover the change.
- If coverage is missing, write or update the tests now. If that cannot be confirmed, stop and tell the user why.

Why it changed (2026-11-25): the earlier version used `PreToolUse` with matcher `write`. It fired on every write, including docs and spec files, and relied on the agent to notice the path and skip. It now fires only after a save under `packages/core/src/`.

Limits:

- A `PostFileSave` hook cannot block the save. The test check happens after the file is written.
- It covers only saves made through Kiro. A save typed in the editor or a file written by a shell command is not documented to trigger it.
- It is an agent prompt, so the agent can skip or misread it, and nothing enforces the result.

## How to see each hook fire

Both hooks react to the agent's actions, so the edit must be made by the agent in chat, not typed by you. Open the Agent Hooks panel in the Kiro sidebar first and confirm both hooks are listed and enabled. If they are not, restart the Kiro session so it loads `.kiro/hooks/`.

**Typecheck hook.**

1. Type in chat: `Add a one-line comment to packages/core/src/time.ts, nothing else.`
2. After the agent saves the file, look for a hook card named "Typecheck and test on save" in the chat or in the Agent Hooks panel, followed by the agent running `npm run typecheck -w packages/core` and `npx vitest --run` on `time.test.ts` and `time.pbt.test.ts`.
3. On camera: the hook card, the two commands, the pass result.
4. Revert the comment afterwards.

**Test gate hook.**

1. Type in chat: `Add a comment to packages/core/src/schemas.ts, nothing else.`
2. After the agent saves the file, look for a hook card named "Require test update for core logic and schemas", and the agent checking `schemas.test.ts`, `snapshot-roundtrip.pbt.test.ts` and `faa-body.pbt.test.ts`.
3. On camera: the hook card and the agent's check. The save has already happened, because the hook cannot block it.
4. Revert the change.

## Firing record

Task 6 of `.kiro/specs/submission-polish/tasks.md`. The owner watched both hooks fire in Kiro and asked for this record. If a hook does not fire, record the Kiro version and the symptom here and do not claim the hook fires in any document.

| Hook | Date | What was done | Result | Kiro version |
| --- | --- | --- | --- | --- |
| Typecheck and test on save | 2026-11-25 (local time -06:00) | The owner asked Kiro in chat to "Add a comment to airports.ts". Kiro added one comment line at the top of `packages/core/src/airports.ts` with a normal file save at about 16:41:14. | Fired after the save. The agent was asked to run `npm run typecheck -w packages/core` and the mirrored tests. Typecheck passed with no errors (16:41:19 to 16:41:22). `npx vitest --run packages/core/test/airports.test.ts` passed 9/9 (finished 16:41:27). Owner confirmed. | Not recorded |
| Require test update for core logic and schemas | 2026-11-25 (local time -06:00) | Same save of `packages/core/src/airports.ts`. | Fired after the same save. The agent was asked to confirm the mirrored tests cover the change. The mirror is `packages/core/test/airports.test.ts` (no `airports.pbt.test.ts` exists). The change is comment-only, so no test update was needed. Owner confirmed. | Not recorded |

Notes: the times are when the hook-requested commands ran. Kiro does not show its own firing timestamps. Both hook instructions arrived in the agent's next message after the save. The `schemas.ts` branch of the Test_Gate hook has not been exercised.

## History

The first two hooks were added in commit `66e1b0e` ("chore: add Kiro agent hooks"). They used the older flat format (`when`, `then`, `toolTypes`). `lint-on-save.json` ran `npx eslint --fix`, but ESLint is not installed and is outside the approved stack in `.kiro/steering/tech.md`. `require-test-update.json` watched `src/lib/schemas/` and `tests/pbt/`, paths that do not exist here. No firing of either was recorded. See `docs/kiro-audit.md` and the "Hooks" section of `docs/kiro-usage.md`.

The `submission-polish` spec replaced them: `lint-on-save.json` was deleted, `typecheck-on-save.json` was created, and `require-test-update.json` was rewritten in the v1 schema. The Kiro docs map the old `fileEdited` trigger to `PostFileSave` and `when.patterns` to `matcher`; `toolTypes` appears in no current page, so `matcher: "write"` replaces it.

2026-11-25: `require-test-update.json` changed from `PreToolUse` with matcher `write` to `PostFileSave` with a path regex for `packages/core/src/**/*.ts`, because the `PreToolUse` version interrupted every write, including docs. Spec: `.kiro/specs/ui-review-fixes/` (Requirement 24). The matcher was checked against sample paths with a one-off script; it was observed firing on 2026-11-25 (see "Firing record").

## Sources

- Kiro hooks overview and schema: https://kiro.dev/docs/hooks/
- Hook triggers and matchers: https://kiro.dev/docs/hooks/types/
- IDE 1.0 hooks format and trigger mapping: https://kiro.dev/docs/ide/whats-new-v1/hooks/
- Design: `.kiro/specs/submission-polish/design.md`
