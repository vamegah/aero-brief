# Kiro audit (contest-judge view)

Scope: `.kiro/steering`, `.kiro/specs/aerobrief`, `.kiro/hooks`, `docs/kiro-usage.md`, `README.md`, `.gitignore`. No hooks, `.env.example` or dependencies were changed. No secret values appear in this report.

## Visible and compelling

- **Spec-driven build.** `.kiro/specs/aerobrief/` has requirements (33 KB), design (62 KB, 35 numbered correctness properties) and tasks (33 KB). `tasks.meta.json` (46 KB) records execution history. Tasks cite requirements and property tasks carry `**Validates: Requirements ...**`.
- **Steering that has effects.** `tech.md`, `structure.md` and `scope.md` are `inclusion: always`. `product.md` is `manual`. `docs/decisions.md` and the design's "Stack Deviations" table show the approval rule working (Hono refused, so a hand-written router). `tests/repo-guard.test.ts` enforces steering rules as a test.
- **Property-based testing.** 41 `*.pbt.test.ts` files tagged `// Feature: aerobrief, Property N`, traceable to the design.
- **Honest documentation.** `docs/kiro-usage.md` names its own gaps and claims nothing it cannot back. `README.md` links to it and lists the `.kiro/` folders.
- **`.kiro/` is not ignored.** `.gitignore` has no rule matching `.kiro/` (`git check-ignore` reports nothing for `.kiro/steering/tech.md`). It ignores `node_modules`, `dist`, `build`, `.wrangler`, `.dev.vars`, `.env*` (except `.env.example`), `*.tsbuildinfo` and `.neon`.

## Gaps

| # | Severity | Gap | Recommended fix |
| --- | --- | --- | --- |
| 1 | Critical | `.env.example` appears to hold real values, not placeholders. Lengths and shapes of `DATABASE_URL`, `TEST_DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `RUNTIME_DATABASE_URL`, `RESEND_API_KEY` and `UNSUBSCRIBE_SECRET` look like live credentials. The file is explicitly un-ignored (`!.env.example`) and untracked, so the first `git add` would publish them. | Before the first commit: rotate every credential in that file (Neon role passwords, Resend key, unsubscribe secret), then replace the values with obvious placeholders such as `postgres://USER:PASSWORD@HOST/DB`. Do not copy the current values into docs, CI or logs. Consider a CI check that fails if `.env.example` contains a non-placeholder. |
| 2 | High | The repo has **no commits** (`master` has none). Judges see nothing until the first push, and `git ls-files .kiro` is empty. | Review `git status`, stage files by name, confirm `.kiro/`, `docs/`, `README.md` are included and `.env`, `.neon` are not, then commit after fixing gap 1. |
| 3 | High | `lint-on-save.json` is broken. It runs `npx eslint --fix`, but no ESLint config or dependency exists, and CI does not run ESLint. | Either remove the hook, or get approval for ESLint (it is outside the approved stack, so flag it per `tech.md`) and add config and a CI step. A stack-neutral alternative is to change the hook to run `npx tsc --noEmit -p <package>`. |
| 4 | High | `require-test-update.json` never matches. It targets `src/lib/schemas/` and `tests/pbt/`, which do not exist. Schemas are in `packages/core/src/schemas.ts` (the directory `packages/core/src/schemas/` named in `structure.md` is also absent). Tests are in `packages/core/test/*.pbt.test.ts`. Its `toolTypes: ["write"]` form is also the older hook schema. | Rewrite the paths to `packages/core/src/schemas*` and `packages/core/test/<name>.pbt.test.ts`, and re-test it by editing a schema file. Reconcile the `structure.md` path with reality. |
| 5 | Medium | No evidence of either hook firing. | After fixing, trigger each once and record a short log or screenshot in `docs/`. |
| 6 | Medium | No MCP evidence. `.kiro/settings/` exists but could not be listed (access denied). A `.neon` file suggests Neon linkage but proves nothing. | Check `.kiro/settings/mcp.json` yourself. If an MCP server was used (for example Neon), commit a secret-free config (env references only) and add a 3-line example of what it did in `docs/kiro-usage.md`. If not, leave the "No evidence" wording. |
| 7 | Medium | No custom agents (`.kiro/agents/`). | Optional. Only add one if it does real work (for example a PBT reviewer). Do not add an empty one for show. |
| 8 | Low | Steering `product.md` is manual and `structure.md` keeps template comment text at the top. | Remove the template comment block, and say in the README that `/product` loads product context. |
| 9 | Low | `README.md` and `kiro-usage.md` show no deployed URLs or demo link (Task 13.2 onward and 14.4/14.5 open). | Add the live URL and demo video link once available. |
| 10 | Low | `docs/kiro-usage.md` says the hooks section is "to be fixed"; once gaps 3 and 4 are done it will be out of date. | Update it in the same change as the hook fixes. |

## Suggested order

1. Rotate credentials and sanitize `.env.example` (gap 1).
2. Fix or remove both hooks and verify they fire (gaps 3 to 5).
3. Decide on MCP and agents evidence (gaps 6 and 7).
4. Make the first commit (gap 2), then update `docs/kiro-usage.md` and the README (gaps 9 and 10).
