# Kiro hooks

## Purpose

AeroBrief has two Kiro agent hooks in `.kiro/hooks/`. They tie the repository's own rules to the agent's edits: typecheck and test what the agent saves, and check that tests are updated before it writes pure logic. Both use the current Kiro hook schema (`version: "v1"` and a `hooks` array). Both are agent actions: they inject a prompt into the conversation.

Status: the files are written and parse as JSON. Nothing in this document claims that either hook fires until a row in the "Firing record" table says so.

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
| Trigger | `PreToolUse` |
| Matcher | `write` (Kiro's built-in category for file write tools) |
| Action | `agent` prompt |

What the agent is asked to do before any write:

- Path not under `packages/core/src/`: do nothing.
- Path under `packages/core/src/`: confirm the mirrored tests in `packages/core/test/` (`<name>.test.ts`, `<name>.pbt.test.ts`) are updated for the change, or are updated in the same task.
- Path `packages/core/src/schemas.ts`: confirm that `schemas.test.ts`, `snapshot-roundtrip.pbt.test.ts` and `faa-body.pbt.test.ts` cover the change.
- If coverage is missing, write or update the tests first, then do the source write. If that cannot be confirmed, stop and tell the user why.

Limits:

- It is an agent prompt and does not block a write. Only a `command` action that exits with code 2 blocks a `PreToolUse` event. A blocking version needs a script, which this repository does not have.
- The `write` matcher covers the built-in file write tools. It does not cover shell commands that write files (for example redirection in a terminal command).
- The hook runs on every write and relies on the agent to read the path and skip the rest.

## How to see each hook fire

Both hooks react to the agent's actions, so the edit must be made by the agent in chat, not typed by you. Open the Agent Hooks panel in the Kiro sidebar first and confirm both hooks are listed and enabled. If they are not, restart the Kiro session so it loads `.kiro/hooks/`.

**Typecheck hook.**

1. Type in chat: `Add a one-line comment to packages/core/src/time.ts, nothing else.`
2. After the agent saves the file, look for a hook card named "Typecheck and test on save" in the chat or in the Agent Hooks panel, followed by the agent running `npm run typecheck -w packages/core` and `npx vitest --run` on `time.test.ts` and `time.pbt.test.ts`.
3. On camera: the hook card, the two commands, the pass result.
4. Revert the comment afterwards.

**Test gate hook.**

1. Type in chat: `Add a comment to packages/core/src/schemas.ts, nothing else.`
2. Before the write, look for a hook card named "Require test update for core logic and schemas", and the agent checking `schemas.test.ts`, `snapshot-roundtrip.pbt.test.ts` and `faa-body.pbt.test.ts`.
3. On camera: the hook card and the agent's check. The write may still go ahead, because the hook cannot block it.
4. Decline or revert the change.

## Firing record

Filled in by the owner in task 6 of `.kiro/specs/submission-polish/tasks.md`. If a hook does not fire, record the Kiro version and the symptom here and do not claim the hook fires in any document.

| Hook | Date | What was done | Result | Kiro version |
| --- | --- | --- | --- | --- |
| Typecheck and test on save |  |  |  |  |
| Require test update for core logic and schemas |  |  |  |  |

## History

The first two hooks were added in commit `66e1b0e` ("chore: add Kiro agent hooks"). They used the older flat format (`when`, `then`, `toolTypes`). `lint-on-save.json` ran `npx eslint --fix`, but ESLint is not installed and is outside the approved stack in `.kiro/steering/tech.md`. `require-test-update.json` watched `src/lib/schemas/` and `tests/pbt/`, paths that do not exist here. No firing of either was recorded. See `docs/kiro-audit.md` and the "Hooks" section of `docs/kiro-usage.md`.

The `submission-polish` spec replaced them: `lint-on-save.json` was deleted, `typecheck-on-save.json` was created, and `require-test-update.json` was rewritten in the v1 schema. The Kiro docs map the old `fileEdited` trigger to `PostFileSave` and `when.patterns` to `matcher`; `toolTypes` appears in no current page, so `matcher: "write"` replaces it.

## Sources

- Kiro hooks overview and schema: https://kiro.dev/docs/hooks/
- Hook triggers and matchers: https://kiro.dev/docs/hooks/types/
- IDE 1.0 hooks format and trigger mapping: https://kiro.dev/docs/ide/whats-new-v1/hooks/
- Design: `.kiro/specs/submission-polish/design.md`
