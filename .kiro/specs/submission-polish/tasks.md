# Implementation Plan: Submission Polish

## Overview

Fix the two Kiro hooks and bring four documents in line with the live product before the demo video is recorded. The work is JSON and Markdown only. Order: hooks, hooks documentation, then the three documents in parallel, a checkpoint, and the owner's firing check.

**Guardrails for every task.**

- Never read or print `.env`, `.env.backup` or any `.dev.vars` file.
- Do not commit, push, tag or deploy. The owner commits.
- Change files only under `.kiro/hooks/`, `.kiro/specs/submission-polish/` and `docs/`. Edit no application code and no other spec.
- Add no dependency. Do not install or reference ESLint.
- Every factual claim in a document cites a file or a commit. Check a commit with `git show --stat <hash>` before citing it. If the evidence does not support a claim, reword or remove the claim and list it in the final report.
- A task marked **needs user action** cannot be done by the agent. Stop and tell the owner the exact step.

## Tasks

- [x] 1. Make the two hooks real
  - [x] 1.1 Write the two hook files in the current Kiro v1 schema
    - Create `.kiro/hooks/typecheck-on-save.json` and rewrite `.kiro/hooks/require-test-update.json` using the JSON in `design.md` (sections "Typecheck_Hook" and "Test_Gate_Hook"). Delete `.kiro/hooks/lint-on-save.json`.
    - Before writing, re-open https://kiro.dev/docs/hooks/ and https://kiro.dev/docs/ide/whats-new-v1/hooks/ and confirm `version`, `hooks`, `trigger`, `matcher` and `action` still match `design.md`. If the schema changed, update `design.md` section "Hook schema: finding and decision" first and tell the owner.
    - Run the matcher checks from `design.md` "Testing Strategy" item 3 as a one-off command. Add no test file.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.5_

  - [x] 1.2 Write `docs/hooks.md`
    - Sections as listed in `design.md` ("Hooks_Doc"): purpose, the two hooks with file, trigger, matcher, behavior and limits, how to see each fire (the edit is made by the agent), an empty "Firing record" table (columns date, what was done, result, Kiro version), history, sources.
    - State that the Test_Gate_Hook is an agent prompt that does not block a write, that the `write` matcher does not cover shell commands that write files, and that the Typecheck_Hook fires on saves made by the agent.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 2. Update `docs/kiro-usage.md`
  - Apply the edits in `design.md` ("Kiro_Usage_Doc edits"): the opening paragraph and Summary table, the Hooks section (fixed hooks, history kept, link to `docs/hooks.md`), the Phase 2 section (flags on in production verified 2026-11-25, migrations 0004 to 0006 applied with Neon restore points, Safe_Send_Mode on), "Later specs" (add `ui-improvements`), the MCP section, and "What this document does not claim".
  - Add the section "Where Kiro surprised us" with items (a) to (f) and the evidence table checks from `design.md`. Find the commit for item (d) with `git log -S"safeString" --oneline -- apps/poller/src/faa-client.ts`.
  - Recount `*.pbt.test.ts` files (command in `design.md`, "Counts") and update every count in the file.
  - Keep the document factual: each claim cites a file or a commit; remove or mark "not recorded in the repository" any claim that does not.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 3. Rewrite `docs/demo-script.md`
  - Replace the shot list with the outline in `design.md` ("Demo_Script outline"): a table with time, screen, narration line and what to have open for each of the nine shots, plus a fallback per shot. Keep and update the stale-banner section, the alert email options, the pre-recording checklist and the YouTube upload notes. Add a first line telling the owner to check the maximum video length in the Devpost rules before recording.
  - Show only Built_Features. List what not to show: map, airport detail redesign, delays or closures, Terms and Privacy.
  - Tell the owner to sign in with an allowlisted address for the digest and webhook shots (Safe_Send_Mode is on). Name the webhook test event control from `apps/web/src/components/WebhookSettings.tsx` after reading its labels.
  - Take every UI label and path from the code in `apps/web/src` (read the components), not from memory.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [x] 4. Update `docs/devpost-submission.md`
  - Apply the edits in `design.md` ("Devpost_Copy edits"): live Phase 2 features with Safe_Send_Mode, the UI improvements, 30 Core airports, the relay with its approval, the Kiro story with at least two surprises, hooks, MCP, a recounted PBT file count, accurate "What's next" from the Deferred dispositions, and updated judge testing notes.
  - Remove every statement that a feature is off by default in production or that production use is not claimed. Do not list the map view as a next step.
  - Keep the category, the project name, the built-with list, the try-it links and the team checklist, updated where facts changed.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 5. Checkpoint - Verify the repository and the hook files
  - Run `npm test` and `npm run typecheck`. Report the passed and failed test counts and the exit codes.
  - Parse each hook file as JSON and check `version` is `"v1"`, `hooks` is a non-empty array, each hook has `name`, `trigger` and `action`, and each `matcher` compiles as a regex. Run the matcher sanity cases from `design.md`.
  - Search for `eslint`, `src/lib/schemas` and `tests/pbt` in `.kiro/hooks/`; search `docs/kiro-usage.md`, `docs/devpost-submission.md` and `docs/demo-script.md` for "off by default" and check no remaining hit refers to production.
  - Run `git status --short` and confirm changes are only under `.kiro/hooks/`, `.kiro/specs/submission-polish/` and `docs/`.
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 7.1, 7.2, 7.3_

- [-] 6. Confirm each hook fires in Kiro (**needs user action**)
  - The owner restarts the Kiro session so it loads `.kiro/hooks/`, then opens the Agent Hooks panel and confirms both hooks are listed and enabled.
  - Typecheck_Hook: ask Kiro in chat to make a harmless edit to a file in `packages/core/src/` (for example add a one-line comment to `packages/core/src/time.ts`), then watch the hook run the typecheck and the mirrored tests. Revert the comment afterwards.
  - Test_Gate_Hook: ask Kiro to change `packages/core/src/schemas.ts` (for example add a comment) and watch the hook ask for the mirrored tests before the write. Decline or revert the change.
  - Record date, what was done, result and Kiro version in the "Firing record" table of `docs/hooks.md`. Take a screenshot of each hook run for the video.
  - If a hook does not fire, record the Kiro version and the symptom in `docs/hooks.md`, tell the agent, and do not claim that the hook fires in any document.
  - _Requirements: 7.4, 7.5, 7.6_

## Notes

- This spec contains no optional sub-tasks and no property tests: it changes configuration and documents, so there is no function to state a universal property about (`design.md`, "Testing Strategy").
- Task 6 cannot be done by an agent. The agent stops after the checkpoint and reports.
- Facts used throughout (owner, 2026-11-25): all four flags on in production, migrations 0004 to 0006 applied with Neon restore points, Safe_Send_Mode on.
- Deadline: December 4, 2026, 2:00 PM PT. `main` is frozen after it until judging has finished, so the owner commits these changes and records the video before then.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2", "3", "4"] },
    { "id": 3, "tasks": ["5"] },
    { "id": 4, "tasks": ["6"] }
  ]
}
```
