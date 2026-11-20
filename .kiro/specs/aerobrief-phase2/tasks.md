# Implementation Plan: AeroBrief Phase 2

## Overview

Four features are built on the branch `phase-2`, each behind its own flag that is off by default: dark mode, a high-contrast AAA theme, signed outbound webhooks and a daily digest email. Sections are ordered by merge order: dark mode, high contrast, webhooks, digest. Section 1 holds the shared plumbing (flags, `/api/features`, `FeaturesProvider`, guards, Neon branch). Section 6 holds the final verification, documentation and the production enable plan.

All code is TypeScript with `"strict": true`. The stack is fixed by workspace steering. No dependency or devDependency is added. Scope boundaries in `.kiro/steering/scope.md` stay in force: no scraping, no push notifications, no map view, no native apps, no passwords, no FAA SWIM.

**Guardrails for every task.**

- Do not edit `.kiro/specs/aerobrief/`. Do not edit `apps/web/src/styles/tokens.css`, `apps/web/src/styles/palette.ts` or any existing test file.
- Never read or print `.env`. The user supplies connection strings in their own shell.
- No task pushes, tags, moves `mvp-contest-2026` or deploys. The project owner pushes `main` once, at the end.
- Tasks marked **needs user approval** create a resource, change a production workflow, delete data on a branch or affect the production deploy. Ask with the user_input tool and wait for the answer before acting.
- Tasks marked **needs user action** cannot be done by the agent. Stop, tell the user the exact step, and wait.
- Each feature section's commits touch no code of another feature, except shared flag helpers and shared test helpers, so a feature can be reverted with `git revert` on its own.
- After December 4, 2026, 2:00 PM PT, no merge into `main` happens until judging has finished.

**Barrel files.** The first task of the webhooks and digest sections creates stub modules and the barrel exports, so parallel tasks in one wave never edit the same barrel file.

## Tasks

- [x] 1. Setup: flags, features endpoint, guards and Neon branch
  - [x] 1.1 Implement flag parsing in `packages/core`
    - Create `packages/core/src/schemas/flags.ts` (Zod: `"true"` and `"false"` map to booleans, anything else is invalid) and `packages/core/src/flags.ts` exporting `parseFlags(raw: Record<string, string | undefined>): { flags: Flags; warnings: string[] }` and the `Flags` type inferred from the schema.
    - Flags: `FEATURE_DARK_MODE`, `FEATURE_HIGH_CONTRAST`, `FEATURE_DIGESTS`, `FEATURE_WEBHOOKS`. Absent or invalid means off. One warning per invalid flag names the flag and never its value.
    - Export from `packages/core/src/index.ts`. Do not touch `parseEnv`.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.8_

  - [x] 1.2 Write property test for flag parsing
    - **Property 1: Flag parsing defaults and independence**
    - Create `packages/core/test/flags.pbt.test.ts`. Tag: `// Feature: aerobrief-phase2, Property 1: Flag parsing defaults and independence`. `numRuns` of 100 or more.
    - **Validates: Requirements 1.2, 1.3, 1.8**

  - [x] 1.3 Add the Phase 2 route table and `GET /api/features` to the API
    - Create `apps/api/src/features.ts` (reads flags with `parseFlags`, logs warnings) and `apps/api/src/routes-phase2.ts` (separate table). Change `router.ts` only to fall through to the Phase 2 table after `routes` finds no match. `routes.ts` stays unchanged.
    - `GET /api/features`: 200 with `{ darkMode, highContrast, digests, webhooks }` and `Cache-Control: no-store` while at least one flag is on; the exact unknown-route 404 (body and headers) while all are off. No cookie read, no database query.
    - Export a helper that returns the unknown-route 404 response, so later disabled routes reuse it.
    - Add `apps/api/test/features.test.ts` and `apps/api/test/router-phase2.test.ts`. Run `router.test.ts` and `routes.test.ts` unchanged.
    - _Requirements: 1.5, 1.6, 2.1, 2.2, 2.3, 2.4_

  - [x] 1.4 Add the flag reader to the Poller
    - Create `apps/poller/src/features.ts` that calls `parseFlags(env)` once per scheduled run and logs the warnings. Add `apps/poller/test/features.test.ts`.
    - _Requirements: 1.2, 1.3, 1.4_

  - [x] 1.5 Add `FeaturesProvider` and `useFeatures` to the Frontend
    - Create `apps/web/src/features/FeaturesProvider.tsx`, `use-features.ts` and a Zod response schema. Wrap `<App />` in `main.tsx`.
    - Render children at once with all flags off. Request `/api/features` once with a 3-second `AbortController` timeout. On a non-2xx status, timeout, network error or invalid body keep all flags off. `useFeatures()` returns all-off without a provider. Read no flag from the URL, local storage or a build variable.
    - Add `apps/web/test/features-provider.test.tsx` covering each failure, the no-provider default and the ignored sources. Existing component tests run unchanged.
    - _Requirements: 1.7, 2.5, 2.6, 2.7, 2.8_

  - [x] 1.6 Add the flags-off guard tests
    - Create `tests/flags-off-guard.test.ts` or per-app guard files that assert: SHA-256 of `tokens.css` and `palette.ts` equal the values taken from `git show mvp-contest-2026:<path>` (store the hashes as constants); `parseEnv` returns equal output for sample input; the `routes` table keys equal a stored list; with all flags off, `/api/features` returns a body and headers equal to those of a truly unknown path.
    - Later sections extend the 404-equality check for their own routes.
    - _Requirements: 2.2, 2.4, 3.1, 3.2, 3.3_

  - [x] 1.7 Document the flags in the environment examples
    - Add the four `FEATURE_*` names, all `false`, to `.env.example`, `apps/api/.dev.vars.example` and `apps/poller/.dev.vars.example`, with a comment that absent means off. Do not read `.env`. Do not add flags to `wrangler.jsonc`.
    - _Requirements: 1.1_

  - [x] 1.8 Add the Phase 2 migration target guard
    - Create `packages/db/src/phase2-target.ts` exporting `assertPhase2Target(databaseUrl, expectedHost)`: refuses when `expectedHost` is unset, when the hosts differ after removing `-pooler`, or when the host equals the production host. Create `scripts/migrate-phase2.ts` that reads the URL and hosts from the environment, calls the guard before any statement, and prints which target it refused without credentials.
    - Add `packages/db/test/phase2-target.test.ts`.
    - _Requirements: 4.5, 4.6_

  - [x] 1.9 Guard the production deploy workflow (needs user approval)
    - Ask the user to approve the edit. Then add `if: github.ref == 'refs/heads/main'` to the job in `.github/workflows/deploy-workers.yml`, with no other change.
    - Add `tests/deploy-guard.test.ts` that reads the file as text and asserts the line exists.
    - The edit changes a production workflow. It takes effect on the next push to `main`, which the user performs.
    - _Requirements: 6.7, 6.8_

  - [x] 1.10 Create the Neon branch `phase-2` (needs user approval)
    - Ask the user to approve creating the resource. Then use the Neon MCP `create_branch` tool with the name `phase-2` from the production branch. Record only the branch name, branch id and host name in `docs/decisions.md`, never a connection string or password.
    - Ask the user to set `PHASE2_DATABASE_URL` and `PHASE2_DB_HOST` in their own shell for the migration script.
    - _Requirements: 4.5, 5.1_

  - [x] 1.11 Remove copied production users from the branch and seed test users (needs user approval)
    - The branch copies production data. Ask the user to approve deleting rows on the `phase-2` branch only. Verify the target is the `phase-2` branch id from Task 1.10 before any statement. Delete `users` rows (cascading to sessions, magic links and subscriptions), then confirm the counts of users, sessions, magic links and subscriptions are 0.
    - Create `packages/db/seed/phase2-test-users.sql` that inserts test Users with allowlisted addresses (`delivered@resend.dev` and addresses the user supplies). Run it on the branch only.
    - _Requirements: 5.2_

  - [x] 1.12 Checkpoint: MVP regression with all flags off
    - Run root `npm test` and `npm run typecheck` with every flag off. All MVP tests pass with no existing test file edited. Ask the user if questions arise.
    - _Requirements: 3.1, 3.6_

- [x] 2. Dark mode (flag `FEATURE_DARK_MODE`)
  - [x] 2.1 Audit the stylesheets for hard-coded colors
    - Search `apps/web/src/app.css`, `primitives.css` and `index.css` for literal colors (hex, `rgb`, `hsl`, named colors) outside `tokens.css`. Write the findings to `docs/theme-audit.md`.
    - Route each literal through an existing token. If none fits, add a new token in a new file `apps/web/src/styles/tokens-phase2.css` with the same light value, and add it to a new typed `extraPalette` in `themes.ts` (Task 2.5). Never edit `tokens.css` or `palette.ts`. The computed light color must stay equal.
    - _Requirements: 3.3, 8.7_

  - [x] 2.2 Implement theme resolution in `packages/core`
    - Create `packages/core/src/theme.ts` with `ThemeVariant`, `ThemeInput` and `resolveTheme(input)`. Total function, never throws. Flag off ignores the stored value. Unknown stored values count as `system` or `standard`. Only the exact value `high` selects high contrast.
    - Export from `packages/core/src/index.ts`.
    - _Requirements: 8.3, 8.4, 8.11, 8.12, 9.3, 9.5, 9.6, 9.7_

  - [x] 2.3 Write property test for theme totality
    - **Property 2: Theme resolution is total**
    - Create `packages/core/test/theme.pbt.test.ts`. Tag: `// Feature: aerobrief-phase2, Property 2: Theme resolution is total`. `numRuns` of 100 or more.
    - **Validates: Requirements 8.11, 9.5, 9.6**

  - [x] 2.4 Write property test for MVP-look defaults
    - **Property 3: Features off or invalid input resolves to the MVP look**
    - Add to `packages/core/test/theme.pbt.test.ts` or a second file `theme-defaults.pbt.test.ts`. Tag: `// Feature: aerobrief-phase2, Property 3: Features off or invalid input resolves to the MVP look`. `numRuns` of 100 or more.
    - **Validates: Requirements 8.3, 8.12, 9.3, 9.7**

  - [x] 2.5 Add the dark token set
    - Create `apps/web/src/styles/themes.ts` (`darkPalette` typed `Record<PaletteToken, string>`, `themePalettes`, `extraPalette` if Task 2.1 needed it), `themes.css` (`html[data-theme="dark"]` block redefining every `--color-*` property, `color-scheme: dark`) and `themes.pairs.ts` (`MIN_RATIO_AAA`, `themePairs(variant)` derived from `palettePairs`).
    - No `prefers-color-scheme` rule anywhere. Fix a failing pair by changing the token, never the threshold.
    - _Requirements: 8.5, 8.7, 8.8_

  - [x] 2.6 Add the token sync and contrast tests for dark
    - Create `apps/web/test/themes-sync.test.ts` (every token in `themes.ts` appears in the matching `themes.css` block with the same hex, mirroring `palette-sync.test.ts`) and `apps/web/test/themes-contrast.test.ts` (every dark pair meets 4.5 / 3 / 3).
    - _Requirements: 8.7, 8.8_

  - [x] 2.7 Write property test for dark token contrast
    - **Property 4: Theme tokens meet their contrast thresholds**
    - Create `apps/web/test/themes-contrast.pbt.test.ts` for the `dark` variant first (Task 3.3 extends it). Check the pair set equals `palettePairs`. Tag: `// Feature: aerobrief-phase2, Property 4: Theme tokens meet their contrast thresholds`. `numRuns` of 100 or more.
    - **Validates: Requirements 8.8, 9.9**

  - [x] 2.8 Add `ThemeController`
    - Create `apps/web/src/theme/ThemeController.tsx`, rendered only while `darkMode` is on. It reads `aerobrief.theme`, calls `resolveTheme`, sets `document.documentElement.dataset.theme` (`dark`), removes the attribute for light, and follows `matchMedia("(prefers-color-scheme: dark)")` through script. With the flag off it renders nothing, reads nothing and writes nothing.
    - Import `themes.css` (and `tokens-phase2.css` if present) in `main.tsx` after `tokens.css`.
    - Add `apps/web/test/theme-controller.test.tsx`: stored values, invalid values, a `matchMedia` change, flag off writes nothing and sets no attribute.
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 2.9 Add the "Display settings" section with the Theme control
    - Create `apps/web/src/components/DisplaySettings.tsx`: a `section` titled "Display settings" with a `fieldset`, `legend` "Theme" and three native radios (System, Light, Dark). Selecting an option stores `aerobrief.theme` and applies the variant without reload. Renders nothing when both flags are off.
    - Add one conditional element in `App.tsx` between the page content and `Footer`, so it shows on every page and not in the nav bar. Style with classes in a new CSS file. No DOM change to the nav bar, banners, airport table or live regions.
    - Add `apps/web/test/display-settings.test.tsx`: roles, labels, keyboard use, absent when the flag is off, same on every page.
    - _Requirements: 8.1, 8.2, 8.9, 8.10, 9.12_

  - [x] 2.10 Add axe tests for the dark variant
    - First confirm how `axe.ts` treats the `color-contrast` rule in jsdom and note it in `docs/theme-audit.md`. Create `apps/web/test/a11y/themes/dark.test.tsx` that renders the Status, Airport, Watchlist, Sign-in and unsubscribe pages in a test `FeaturesProvider` with `data-theme="dark"` and fails on any violation.
    - _Requirements: 8.13_

  - [x] 2.11 Checkpoint: MVP regression with all flags off
    - Run root `npm test` and `npm run typecheck` with every flag off. All MVP tests pass unchanged. Ask the user if questions arise.
    - _Requirements: 3.1, 3.6_

  - [x] 2.12 Checkpoint: dark mode with its flag on
    - Run the dark-mode tests (Properties 2, 3, 4, controller, settings, axe) with `darkMode` on. All pass. Ask the user if questions arise.
    - _Requirements: 3.6, 6.3_

  - [x] 2.13 Merge dark mode into `main` (local merge, no push)
    - Run only on the owner's instruction, and only before December 4, 2026, 2:00 PM PT. Confirm Tasks 2.11 and 2.12 passed. Check that this feature's commits touch no other feature's code except shared flag and test helpers. Merge the shared setup commits and the dark-mode commits into `main` locally with all flags off. Do not push, tag or deploy.
    - The commits of this section stay one contiguous range so `git revert` of that range removes dark mode alone. The user pushes all four features together at the end.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7_

- [x] 3. High contrast (flag `FEATURE_HIGH_CONTRAST`)
  - [x] 3.1 Add the AAA token sets
    - In `themes.ts` add `hcLightPalette` and `hcDarkPalette`. In `themes.css` add `html[data-theme="hc-light"]` and `html[data-theme="hc-dark"]` blocks, a 3px focus outline (`outline: 3px solid var(--color-focus)`) and thicker borders, with CSS only and no DOM change. Add the `color-focus` token to each high-contrast palette.
    - Extend `themePairs` for the high-contrast variants: every `palettePairs` entry at 7 / 4.5 / 4.5, plus `color-focus` against every `bg` token (4.5).
    - _Requirements: 9.7, 9.8, 9.9, 9.10_

  - [x] 3.2 Extend the token sync and contrast tests
    - Extend `themes-sync.test.ts` and `themes-contrast.test.ts` to `hc-light` and `hc-dark`.
    - _Requirements: 9.8, 9.9, 9.10_

  - [x] 3.3 Extend the property test for token contrast
    - **Property 4: Theme tokens meet their contrast thresholds**
    - Extend `apps/web/test/themes-contrast.pbt.test.ts` to all three variants, the pair-set equality plus focus pairs, and the 7 / 4.5 / 4.5 thresholds. Keep the tag and `numRuns` of 100 or more.
    - **Validates: Requirements 8.8, 9.8, 9.9, 9.10**

  - [x] 3.4 Extend `ThemeController` for the Contrast_Preference
    - Mount the controller when either flag is on. Read `aerobrief.contrast` only while `highContrast` is on. Set `data-theme` to `hc-light` or `hc-dark`. Never read `prefers-contrast`. With `highContrast` off and `standard` stored, output equals Task 2.8.
    - Extend `theme-controller.test.tsx`.
    - _Requirements: 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [x] 3.5 Add the "High contrast" checkbox to Display settings
    - In `DisplaySettings.tsx` add a native checkbox labelled "High contrast" in the same section as the Theme control, or in a section of its own when `darkMode` is off. It stores `aerobrief.contrast` and applies the variant without reload. Extend `display-settings.test.tsx`.
    - _Requirements: 9.1, 9.2, 9.12_

  - [x] 3.6 Add axe tests for the high-contrast variants
    - Create `apps/web/test/a11y/themes/high-contrast.test.tsx` for the five pages in `hc-light` and `hc-dark`, failing on any violation.
    - _Requirements: 9.11_

  - [x] 3.7 Checkpoint: MVP regression with all flags off
    - Run root `npm test` and `npm run typecheck` with every flag off. All MVP tests pass unchanged. Ask the user if questions arise.
    - _Requirements: 3.1, 3.6_

  - [x] 3.8 Checkpoint: high contrast with its flag on
    - Run the high-contrast tests and the dark-mode tests with both theme flags on. All pass. Ask the user if questions arise.
    - _Requirements: 3.6, 6.3_

  - [x] 3.9 Merge high contrast into `main` (local merge, no push)
    - Run only on the owner's instruction and before the deadline. Confirm Tasks 3.7 and 3.8 passed and dark mode is already merged. Merge this section's commits into `main` locally with all flags off. Do not push, tag or deploy.
    - The commits stay one contiguous range, so `git revert` of that range removes high contrast without touching dark mode.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7_

- [x] 4. Signed webhooks (flag `FEATURE_WEBHOOKS`)
  - [x] 4.1 Add the `webhook-sender` line to the structure steering
    - Add one line to `.kiro/steering/structure.md` under the directory layout: `packages/webhook-sender/` for the signed webhook sender (side effects allowed, `fetch` injected); `packages/core` stays pure; `apps/api` and `apps/poller` import it; `apps/web` must not.
    - This edit is made on `phase-2` and merges with this feature. Change nothing else in the file.
    - _Requirements: 3.8, 7.3_

  - [x] 4.2 Scaffold the core webhook modules and barrels
    - Create stub modules `packages/core/src/webhooks/{url,secret,sign,payload,retry,counter,test-limit}.ts` (each `export {}` until filled), `packages/core/src/webhooks/index.ts` with an `export *` for each, `packages/core/src/safe-send.ts`, and `packages/core/src/schemas/webhook-payload.ts`. Export the barrels from `packages/core/src/index.ts` and the schemas barrel.
    - _Requirements: 14.10, 15.5_

  - [x] 4.3 Implement Safe_Send_Mode helpers
    - In `safe-send.ts` implement `isSafeSendMode(raw)` (absent or `true` is on; only the exact string `false` is off) and `filterAllowlisted(items, allowlist, keyOf)`. `delivered@resend.dev` is always allowed for email. The digest section reuses this module.
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [x] 4.4 Write property test for the allowlist filter
    - **Property 5: Allowlist filter returns only allowlisted recipients**
    - Create `packages/core/test/safe-send.pbt.test.ts`. Tag: `// Feature: aerobrief-phase2, Property 5: Allowlist filter returns only allowlisted recipients`. `numRuns` of 100 or more.
    - **Validates: Requirements 5.7, 5.9**

  - [x] 4.5 Implement the webhook URL validator and masker
    - In `webhooks/url.ts` implement `validateWebhookUrl(input)` with the ordered rules and reason codes from the design (length, parse, scheme, credentials, port, fragment, trailing dot, IPv6, IP literal, localhost, single label, reserved suffix) and `maskWebhookUrl(url)` returning only the host.
    - Add `packages/core/test/webhook-url.test.ts` with concrete examples, including decimal, hex and octal IPv4 forms and `[::1]`.
    - _Requirements: 13.6, 13.13, 14.1, 14.2, 14.3, 14.4, 14.10_

  - [x] 4.6 Write property test for URL safety
    - **Property 11: Webhook URL safety**
    - Create `packages/core/test/webhook-url.pbt.test.ts`. Tag: `// Feature: aerobrief-phase2, Property 11: Webhook URL safety`. `numRuns` of 100 or more. Generators cover IPv4 in dotted, decimal, hex, octal and mixed notation and IPv6.
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.10, 14.11, 14.12**

  - [x] 4.7 Write property test for URL validation idempotence
    - **Property 12: Webhook URL validation is idempotent**
    - Add to `webhook-url.pbt.test.ts`. Tag: `// Feature: aerobrief-phase2, Property 12: Webhook URL validation is idempotent`. `numRuns` of 100 or more.
    - **Validates: Requirements 14.13**

  - [x] 4.8 Write property test for URL masking
    - **Property 13: URL masking exposes only the host**
    - Add to `webhook-url.pbt.test.ts`. Tag: `// Feature: aerobrief-phase2, Property 13: URL masking exposes only the host`. `numRuns` of 100 or more.
    - **Validates: Requirements 13.6, 13.13**

  - [x] 4.9 Implement derived webhook secrets
    - In `webhooks/secret.ts` implement `deriveWebhookSecret(master, webhookId)` as `HMAC-SHA256(utf8(master), utf8("aerobrief.webhook.v1." + webhookId))`, returned as `whsec_` plus base64url (Web Crypto). Reject a master secret shorter than 32 characters with a thrown error that names no secret value.
    - _Requirements: 13.10, 13.11_

  - [x] 4.10 Write property test for secret derivation
    - **Property 14: Webhook secret derivation**
    - Create `packages/core/test/webhook-secret.pbt.test.ts`. Tag: `// Feature: aerobrief-phase2, Property 14: Webhook secret derivation`. `numRuns` of 100 or more.
    - **Validates: Requirements 13.10, 13.11**

  - [x] 4.11 Implement signing and verification
    - In `webhooks/sign.ts` implement `signWebhook(secret, timestamp, body)` returning `v1=` plus lowercase hex of HMAC-SHA256 over `<timestamp>.<body>`, and `verifyWebhook({ secret, timestamp, body, signatureHeader, nowSeconds })` that checks the header format, the 300-second window (inclusive) and uses `crypto.subtle.verify` for the constant-time comparison.
    - _Requirements: 15.2, 15.5, 15.6_

  - [x] 4.12 Write property test for the signature round trip
    - **Property 15: Signature round trip**
    - Create `packages/core/test/webhook-sign.pbt.test.ts`. Tag: `// Feature: aerobrief-phase2, Property 15: Signature round trip`. `numRuns` of 100 or more.
    - **Validates: Requirements 15.2, 15.5, 15.8**

  - [x] 4.13 Write property test for tamper and replay rejection
    - **Property 16: Tamper and replay rejection**
    - Add to `webhook-sign.pbt.test.ts`. Cover exactly 300 seconds (accepted) and 301 seconds (rejected) in both directions. Tag: `// Feature: aerobrief-phase2, Property 16: Tamper and replay rejection`. `numRuns` of 100 or more.
    - **Validates: Requirements 15.5, 15.9, 15.10**

  - [x] 4.14 Implement the payload schema and builder
    - In `schemas/webhook-payload.ts` define `webhookPayloadSchema` (discriminated union on `type`, with the `TEST` type and the field limits from the design). In `webhooks/payload.ts` implement `buildWebhookPayload(event, deliveryId)` and `buildTestPayload(deliveryId, now)`: strip control characters, one-line `text`, explanation cut to 200 characters in `text` only, `&`, `<` and `>` escaped in `text` only, test text beginning with "TEST:".
    - _Requirements: 15.1, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 18.3_

  - [x] 4.15 Write property test for payload validity and size
    - **Property 19: Payload validity and size**
    - Create `packages/core/test/webhook-payload.pbt.test.ts`. Generators include `&`, `<`, `>`, quotes, backslashes, control characters and non-ASCII text. Tag: `// Feature: aerobrief-phase2, Property 19: Payload validity and size`. `numRuns` of 100 or more.
    - **Validates: Requirements 15.1, 17.1, 17.4, 17.5, 17.6, 17.8**

  - [x] 4.16 Write property test for the payload JSON round trip
    - **Property 20: Payload JSON round trip**
    - Add to `webhook-payload.pbt.test.ts`, including the `TEST` type. Tag: `// Feature: aerobrief-phase2, Property 20: Payload JSON round trip`. `numRuns` of 100 or more.
    - **Validates: Requirements 17.9**

  - [x] 4.17 Implement the retry policy
    - In `webhooks/retry.ts` implement `classifyAttempt(result)` and `nextStep(attemptsMade, classification)` as specified: 2xx delivered; network error, timeout, 408, 429 and 5xx retryable; everything else (including 3xx and `blocked_url`) permanent; wait 2000 ms then 8000 ms; stop after 3 attempts.
    - _Requirements: 16.4, 16.5, 16.6, 16.15_

  - [x] 4.18 Write property test for the retry bound
    - **Property 17: Retry bound**
    - Create `packages/core/test/webhook-retry.pbt.test.ts`. Tag: `// Feature: aerobrief-phase2, Property 17: Retry bound`. `numRuns` of 100 or more.
    - **Validates: Requirements 16.4, 16.5, 16.6, 16.15**

  - [x] 4.19 Implement the failure counter
    - In `webhooks/counter.ts` implement `applyOutcome(state, event)` over `{ failures, disabled }` with events `delivered`, `failed`, `skipped` and `reenabled`, as specified.
    - _Requirements: 16.9, 16.10, 16.11, 16.16, 16.18, 16.19_

  - [x] 4.20 Write property test for the failure counter
    - **Property 18: Failure counter and auto-disable**
    - Create `packages/core/test/webhook-counter.pbt.test.ts`. Include `reenabled` twice equals once. Tag: `// Feature: aerobrief-phase2, Property 18: Failure counter and auto-disable`. `numRuns` of 100 or more.
    - **Validates: Requirements 16.9, 16.10, 16.11, 16.16, 16.18, 16.19**

  - [x] 4.21 Implement the test-event rate-limit functions
    - In `webhooks/test-limit.ts` implement `testEventAllowed(lastTestAt, now)` (60-second rule, first request allowed) and `retryAfterSeconds(lastTestAt, now)` returning 1 to 60.
    - _Requirements: 18.6, 18.9_

  - [x] 4.22 Write property test for the test-event rate limit
    - **Property 21: Test event rate limit**
    - Create `packages/core/test/webhook-test-limit.pbt.test.ts`. Tag: `// Feature: aerobrief-phase2, Property 21: Test event rate limit`. `numRuns` of 100 or more.
    - **Validates: Requirements 18.6, 18.9**

  - [x] 4.23 Create the `packages/webhook-sender` package
    - Create the workspace package `@aerobrief/webhook-sender` with its own `package.json` (no external dependency, no new devDependency), a `tsconfig.json` extending the base with `"strict": true`, and `src/send.ts` exporting `sendWebhookOnce({ fetch, url, secret, deliveryId, body, now })`: revalidate the URL, sign with a fresh timestamp, `fetch` with `redirect: "manual"` and `AbortSignal.timeout(5000)`, cancel the response body unread, return `{ status }` or `{ errorKind }` (`timeout`, `network`, `blocked_url`, `invalid_payload`). It returns and logs no URL, secret or response detail.
    - Add `packages/webhook-sender/test/send.test.ts` with a fake `fetch`: manual redirect, 3xx result, timeout, body cancelled, headers present, new timestamp and same Delivery_ID across attempts, a stored unsafe URL is never contacted.
    - Add `tests/import-rules.test.ts` that fails if `apps/web` imports `@aerobrief/webhook-sender` or `packages/core` imports it.
    - _Requirements: 7.3, 14.5, 14.6, 14.7, 14.8, 14.9, 15.1, 15.3, 15.4, 16.8_

  - [x] 4.24 Add the webhook schema, Migration 0004 and its down and grants files
    - Add the Drizzle tables `webhooks` and `webhook_deliveries` in `packages/db/src/schema`. Write `packages/db/migrations/0004_webhooks.sql` as additive only (tables, index, cap trigger and function that locks the user row then counts, mirroring `0001_enforce_subscription_cap`) and add its journal entry. Write `packages/db/migrations/down/0004_webhooks.down.sql` (drop trigger, function, `webhook_deliveries`, `webhooks`) and `packages/db/migrations/grants/0004_webhooks.grants.sql` (`GRANT SELECT, INSERT, UPDATE, DELETE ... TO :runtime_role`).
    - No column name contains `password`, `passwd` or `pass`. The repo guard keeps passing. Do not run the migration here.
    - _Requirements: 3.9, 4.1, 4.2, 4.3, 4.4, 4.8, 13.2, 13.8, 13.9_

  - [x] 4.25 Apply Migration 0004 to the `phase-2` branch (needs user approval)
    - Ask the user to approve. Run `scripts/migrate-phase2.ts` with the branch URL from the user's shell; the guard must pass first. Never run it against the production database.
    - _Requirements: 4.5, 4.6, 4.9_

  - [x] 4.26 Grant table access to the runtime role (needs user action)
    - The user runs `0004_webhooks.grants.sql` in Neon on the `phase-2` branch with their runtime role name. Tell the user the exact file and the psql variable. Wait for confirmation before the integration tests.
    - _Requirements: 4.8_

  - [x] 4.27 Write the Neon branch integration tests for webhooks
    - Create tests that run only through `assertPhase2Target`: Migration then down gives a schema snapshot equal to the snapshot before (`information_schema` and `pg_catalog`); the cap holds under 5 concurrent inserts for one User; the delivery claim with `ON CONFLICT DO NOTHING` returns a row once; the SQL counter equals `applyOutcome` over random sequences; the atomic test-slot update allows one of two simultaneous requests; deleting a User removes webhooks and deliveries; the runtime role has the grants.
    - _Requirements: 4.7, 13.2, 13.3, 13.8, 13.9, 16.3, 16.16, 18.6_

  - [x] 4.28 Add webhook configuration to the API
    - Add a reader for `WEBHOOK_MASTER_SECRET` and the Safe_Send_Mode variables (`SAFE_SEND_MODE`, `SAFE_SEND_ALLOWLIST_EMAILS`, `SAFE_SEND_ALLOWLIST_HOSTS`) in `apps/api/src/features.ts` or a new `webhook-config.ts`, validated with Zod at use. With the flag on and a missing or short master secret, all five webhook routes answer 503 naming the variable only. Add the names to `.env.example` and both `.dev.vars.example` files without values.
    - _Requirements: 13.12, 5.3_

  - [x] 4.29 Add the webhook repository functions
    - In `packages/db/src/webhooks.ts` add: list for a User (no `url` selected), insert (maps the cap error to a validation error), delete, re-enable (idempotent), claim a delivery (`ON CONFLICT DO NOTHING RETURNING`), record an outcome with one atomic `UPDATE` (`CASE` for the counter and state), and claim a test slot (`UPDATE ... WHERE last_test_at IS NULL OR last_test_at <= now - 60 seconds RETURNING`). Select `url` only in the sender-facing function.
    - Add unit tests with a fake client.
    - _Requirements: 13.2, 13.3, 13.6, 13.7, 16.3, 16.9, 16.10, 16.11, 16.18, 16.19, 18.6_

  - [x] 4.30 Add the webhook CRUD routes
    - Add `GET /api/webhooks`, `POST /api/webhooks`, `DELETE /api/webhooks/:id` and `POST /api/webhooks/:id/reenable` to `routes-phase2.ts`, with handlers in `apps/api/src/handlers/webhooks.ts`. Require a session and the same request checks as the watchlist routes. Validate the body with Zod and the URL with `validateWebhookUrl`. Create returns the derived secret once. List returns only `id`, `host`, `createdAt`, `state`, `lastOutcome`, `lastOutcomeAt`, `disabledAt`. Log no URL and no secret. While the flag is off, each route returns the unknown-route 404.
    - Add `apps/api/test/webhooks.test.ts`: secret once, masked list, 4th webhook rejected with existing rows unchanged, unsafe URL 400, foreign id 404, re-enable twice equals once, no session 401.
    - _Requirements: 1.6, 13.1, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 14.1, 16.18, 16.19_

  - [x] 4.31 Add the test-event route
    - Add `POST /api/webhooks/:id/test`. Look up the webhook by id and session user (404 if none). Claim the test slot atomically (429 with `retryAfterSeconds` if refused). Apply the host allowlist while Safe_Send_Mode is on (`failed` with `not_allowlisted`, no request). Build the `TEST` payload, call `sendWebhookOnce` once, return `{ outcome, status?, errorKind? }`, store only `last_test_outcome`. Write no delivery row, never change the failure counter, skip the stale gate, accept a disabled webhook.
    - Add `apps/api/test/webhook-test-event.test.ts` with a fake `fetch`.
    - _Requirements: 5.5, 5.6, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 18.8_

  - [x] 4.32 Add webhook delivery to the Poller
    - Create `apps/poller/src/webhooks.ts` with `dispatchWebhooks(env, events, now)`: run only when `webhooks` is on and the latest Snapshot is fresh; select the same recipients as alert emails; load active webhooks; apply Safe_Send_Mode (record `skipped`, reason `not_allowlisted`); claim each delivery; run claimed deliveries in a pool of 20 following the retry policy; record outcomes with the atomic SQL; log only Delivery_ID, webhook id and host; log the first-attempt delay. Wrap everything so a throw is logged and alert emails stay untouched. Call it after `notify()` returns, behind the flag. A missing or short master secret sends nothing and logs one error.
    - Do not change `notify()`. Add `apps/poller/test/webhooks.test.ts`: stale gate, recipients equal alert-email recipients, retry timings with fake timers, 5 failures disable, a thrown error leaves alert emails unchanged, no email on disable.
    - _Requirements: 5.5, 5.6, 5.7, 13.12, 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9, 16.13, 16.14, 16.17_

  - [x] 4.33 Extend the flags-off guard tests for webhooks
    - With all flags off: every `/api/webhooks...` path returns a body and headers equal to those of an unknown path; the Poller makes no `fetch` and no webhook database query after `notify()`; `notify()` output is unchanged. Add these to the guard test files from Task 1.6 or new files.
    - _Requirements: 1.6, 3.1, 3.2_

  - [x] 4.34 Add the Webhooks section to the Watchlist page
    - Create `apps/web/src/api/webhooks.ts` and `apps/web/src/components/WebhookSettings.tsx`, rendered on the Watchlist page only while `webhooks` is on. It shows the list (host only), an add form, the secret once in a read-only input with the text "This secret cannot be shown again" and a copy Button, a "Re-enable" Button for disabled webhooks with the text "Disabled after repeated failures" and the last outcome time, a "Delete" Button, and a "Send test event" Button with the result as visible text. Results go to a new `aria-live` region without moving focus. Every state (loading, empty, error, success) renders text. These are secondary Buttons.
    - Add `apps/web/test/webhook-settings.test.tsx`: absent while the flag is off; every state; secret shown once; focus not moved.
    - _Requirements: 1.7, 13.1, 13.5, 16.12, 16.17, 18.1_

  - [x] 4.35 Add axe tests for the Webhooks section
    - Create `apps/web/test/a11y/webhooks.test.tsx` rendering the Watchlist page with `webhooks` on in each state, in light, dark, `hc-light` and `hc-dark` where those themes are merged, failing on any violation.
    - _Requirements: 3.6_

  - [x] 4.36 Write the webhook receiver guide
    - Create `docs/webhooks.md`: header names, signed text `<timestamp>.<raw body>`, the full `whsec_...` string as the key, the 300-second Replay_Window, constant-time comparison, Delivery_ID replay storage for at least 10 minutes, retry and auto-disable rules, the payload fields and a TypeScript verification example using Web Crypto. Add an operations note that rotating `WEBHOOK_MASTER_SECRET` invalidates every secret and that it is outside the rotation script.
    - _Requirements: 15.7, 13.10_

  - [x] 4.37 Check a real Slack incoming webhook (needs user action)
    - The user supplies a real Slack incoming-webhook URL that they own, and sets it only in the Safe_Send_Mode host allowlist of their own shell. Ask the user to register it on the `phase-2` branch through the app (local `wrangler dev`), press "Send test event" and confirm that Slack shows the `text` line and accepts the extra JSON fields. Record the result in `docs/decisions.md` without the URL. The agent never receives or stores the URL.
    - Dropped by the project owner on 2026-11-19. Not run; recorded in `docs/decisions.md` and `docs/webhooks.md`.
    - _Requirements: 17.4, 17.7, 18.3_

  - [x] 4.38 Checkpoint: MVP regression with all flags off
    - Run root `npm test` and `npm run typecheck` with every flag off. All MVP tests pass unchanged. Ask the user if questions arise.
    - _Requirements: 3.1, 3.6_

  - [x] 4.39 Checkpoint: webhooks with their flag on
    - Run Properties 5, 11 to 21, the sender, API, Poller, component and axe tests with `webhooks` on, plus the branch integration tests. All pass. Ask the user if questions arise.
    - _Requirements: 3.6, 6.3_

  - [x] 4.40 Merge webhooks into `main` (local merge, no push)
    - Run only on the owner's instruction and before December 4, 2026, 2:00 PM PT. Confirm Tasks 4.37, 4.38 and 4.39 are done and that dark mode and high contrast are merged. Merge this section's commits (including the `structure.md` line) into `main` locally with all flags off. Do not apply Migration 0004 to the production database, push, tag or deploy.
    - The commits stay one contiguous range, so `git revert` of that range removes webhooks without touching the themes. The migration stays unapplied to production until the owner approves that step.
    - _Requirements: 4.9, 6.1, 6.2, 6.3, 6.4, 6.5, 6.7_

- [x] 5. Daily digest (flag `FEATURE_DIGESTS`)
  - [x] 5.1 Scaffold the core digest modules and barrels
    - Create stub modules `packages/core/src/digest/{due,content,unsubscribe}.ts` (each `export {}` until filled), `packages/core/src/digest/index.ts` with an `export *` for each, and export the barrel from `packages/core/src/index.ts`.
    - _Requirements: 11.2, 11.7, 12.1_

  - [x] 5.2 Implement due-time selection
    - In `digest/due.ts` implement `selectDueDigests({ now, prefs, claimedKeys, watchlistCounts })` with offsets 0 to 3 hours, `digestDate` taken from `scheduledAt`, and the drop rules (updated after scheduled instant, empty Watchlist, claimed key).
    - _Requirements: 11.2, 11.3, 11.4, 11.14_

  - [x] 5.3 Write property test for due-digest selection
    - **Property 6: Due-digest selection**
    - Create `packages/core/test/digest-due.pbt.test.ts`. Include midnight catch-up (hour 23 run missed). Tag: `// Feature: aerobrief-phase2, Property 6: Due-digest selection`. `numRuns` of 100 or more.
    - **Validates: Requirements 11.2, 11.3, 11.4, 11.14**

  - [x] 5.4 Implement digest content selection and composition
    - In `digest/content.ts` implement `selectDigestContent` (events in the 24 hours before `now` for watched airports plus `NATIONWIDE_EVENT`, time ordered, Explanation unaltered) and `composeDigest` (subject cut to 100 characters, text and HTML with escaping, the "No disruptions at your airports in the last 24 hours" line plus current status per airport, the stale notice when the latest Snapshot is missing or older than 10 minutes, Watchlist link, unsubscribe link, no raw FAA code).
    - _Requirements: 11.7, 11.8, 11.9, 11.12, 11.16_

  - [x] 5.5 Write property test for digest content selection
    - **Property 8: Digest content selection**
    - Create `packages/core/test/digest-content.pbt.test.ts`. Tag: `// Feature: aerobrief-phase2, Property 8: Digest content selection`. `numRuns` of 100 or more.
    - **Validates: Requirements 11.7**

  - [x] 5.6 Write property test for digest composition
    - **Property 9: Digest composition**
    - Create `packages/core/test/digest-compose.pbt.test.ts`. Tag: `// Feature: aerobrief-phase2, Property 9: Digest composition`. `numRuns` of 100 or more.
    - **Validates: Requirements 11.7, 11.8, 11.9, 11.12, 11.16**

  - [x] 5.7 Implement the digest unsubscribe signature
    - In `digest/unsubscribe.ts` implement `signDigestUnsubscribe(userId, secret)` and `verifyDigestUnsubscribe(userId, sig, secrets)` over the text `digest.` plus the User id, HMAC-SHA256, base64url. Leave `signUnsubscribe` and `verifyUnsubscribe` unchanged.
    - _Requirements: 12.1, 12.2, 12.6, 12.8_

  - [x] 5.8 Write property test for the digest unsubscribe signature
    - **Property 10: Digest unsubscribe signature round trip and separation**
    - Create `packages/core/test/digest-unsubscribe.pbt.test.ts`. Include that a digest signature never verifies under `verifyUnsubscribe`. Tag: `// Feature: aerobrief-phase2, Property 10: Digest unsubscribe signature round trip and separation`. `numRuns` of 100 or more.
    - **Validates: Requirements 12.1, 12.2, 12.8**

  - [x] 5.9 Add the digest schema, Migration 0005 and its down and grants files
    - Add the Drizzle tables `digest_preferences` and `digest_deliveries`. Write `packages/db/migrations/0005_digest.sql` (additive only), its journal entry, `migrations/down/0005_digest.down.sql` (drop `digest_deliveries`, then `digest_preferences`) and `migrations/grants/0005_digest.grants.sql`. No column name contains `password`, `passwd` or `pass`. Do not run it here.
    - _Requirements: 3.9, 4.1, 4.2, 4.3, 4.4, 4.8, 10.2, 10.6_

  - [x] 5.10 Apply Migration 0005 to the `phase-2` branch (needs user approval)
    - Ask the user to approve. Run `scripts/migrate-phase2.ts` against the branch only, after the guard passes.
    - _Requirements: 4.5, 4.6, 4.9_

  - [x] 5.11 Grant table access to the runtime role (needs user action)
    - The user runs `0005_digest.grants.sql` in Neon on the `phase-2` branch with their runtime role name. Wait for confirmation before the integration tests.
    - _Requirements: 4.8_

  - [x] 5.12 Write the Neon branch integration tests for the digest
    - Run only through `assertPhase2Target`: Migration then down gives an equal schema snapshot; the claim insert with `ON CONFLICT DO NOTHING` succeeds once per User and date; deleting a User removes preferences and deliveries; the runtime role has the grants.
    - _Requirements: 4.7, 10.6, 11.5_

  - [x] 5.13 Add the digest repository functions
    - In `packages/db/src/digest.ts` add: read and upsert preferences (`updated_at = now()`), set `enabled` false, load enabled preferences with Watchlist counts and claimed keys for candidate dates, claim a delivery, and record the final status with attempts and completion time. Add unit tests with a fake client.
    - _Requirements: 10.2, 10.3, 10.5, 11.5, 11.10, 12.3_

  - [x] 5.14 Add the digest API routes
    - Add `GET /api/digest` (default `{ enabled: false, hour: 7 }`), `PUT /api/digest` (Zod: boolean `enabled`, integer `hour` 0 to 23; 400 and no write on invalid), and `POST /api/digest/unsubscribe` (verify with `acceptedUnsubscribeSecrets`; 200 and idempotent, 403 and no change on a bad signature) to `routes-phase2.ts`. While the flag is off each returns the unknown-route 404.
    - Add `apps/api/test/digest.test.ts`.
    - _Requirements: 1.5, 10.2, 10.3, 10.4, 10.5, 12.3, 12.4, 12.5, 12.6_

  - [x] 5.15 Add `runDigest` to the Poller
    - Create `apps/poller/src/digest.ts` with `runDigest(env, now)`: parse flags and return at once, before any database, Resend or outbound call, when `digests` is off. Otherwise load data, call `selectDueDigests`, claim each due User, apply Safe_Send_Mode (`not_allowlisted` skipped row), compose, send through Resend with `Idempotency-Key: digest/<userId>/<digestDate>`, retry up to 2 more times after a rejection or a 10-second timeout with waits of 1 and 3 seconds, and record `handed_off` or `failed`. A failed claim stays in place. A per-User error is logged without the email address and the loop continues. No `List-Unsubscribe` header.
    - Add `apps/poller/test/digest.test.ts` with fakes for Resend and the claim store.
    - _Requirements: 1.5, 5.4, 5.6, 5.7, 11.1, 11.2, 11.5, 11.6, 11.10, 11.11, 11.13, 12.9_

  - [x] 5.16 Write property test for digest idempotency
    - **Property 7: Digest idempotency**
    - Create `apps/poller/test/digest-idempotency.pbt.test.ts` running random sequences of `runDigest` over one Digest_Date against an in-memory claim store that rejects duplicate keys. Tag: `// Feature: aerobrief-phase2, Property 7: Digest idempotency`. `numRuns` of 100 or more.
    - **Validates: Requirements 11.5, 11.15**

  - [x] 5.17 Register the hourly digest cron
    - Add `"0 * * * *"` to `apps/poller/wrangler.jsonc` and `export const DIGEST_CRON = "0 * * * *"` plus a `case` in `apps/poller/src/index.ts` that calls `runDigest`. Existing cron cases stay unchanged. Add `apps/poller/test/digest-cron.test.ts` asserting the strings match, the new case calls `runDigest`, and a run with the flag off makes no call. `dispatcher.test.ts` runs unchanged.
    - _Requirements: 1.5, 11.1_

  - [x] 5.18 Extend the flags-off guard tests for the digest
    - With all flags off: `/api/digest` and `/api/digest/unsubscribe` return a body and headers equal to those of an unknown path; `runDigest` makes zero database, Resend and fetch calls; the digest unsubscribe page does not render.
    - _Requirements: 1.5, 3.1, 3.2_

  - [x] 5.19 Add the Daily digest section to the Watchlist page
    - Create `apps/web/src/api/digest.ts` and `apps/web/src/components/DigestSettings.tsx`, rendered only while `digests` is on: section "Daily digest", checkbox "Send me a daily digest", select "Send at (UTC)" of 24 hours preselecting 07:00, one primary Button "Save digest settings", the text "Add an airport to receive a digest" when the Watchlist is empty, and the saved state and errors as visible text with a new `aria-live` region and no focus move.
    - Add `apps/web/test/digest-settings.test.tsx`.
    - _Requirements: 1.7, 10.1, 10.7, 10.8_

  - [x] 5.20 Add the digest unsubscribe page
    - Create `apps/web/src/pages/DigestUnsubscribePage.tsx` at `/digest/unsubscribe` that posts to `POST /api/digest/unsubscribe` and states in text whether the digest was stopped. Render it only while `digests` is on. Add the route in `App.tsx` as one conditional element. Add `apps/web/test/digest-unsubscribe-page.test.tsx`.
    - _Requirements: 12.7_

  - [x] 5.21 Add axe tests for the digest UI
    - Create `apps/web/test/a11y/digest.test.tsx` covering the Daily digest section and the unsubscribe page in each state and theme variant that is merged.
    - _Requirements: 3.6_

  - [x] 5.22 Run the digest cron locally (needs user action)
    - The user runs `wrangler dev --test-scheduled` for the poller, with the `phase-2` branch URL, `FEATURE_DIGESTS=true` and an allowlist of their own addresses in their shell, and triggers `/__scheduled?cron=0+*+*+*+*`. Confirm one email arrives at an allowlisted address, a second trigger sends none, and a non-allowlisted test User is skipped with `not_allowlisted`. Record the result in `docs/decisions.md`. Do not start the dev server from the agent.
    - _Requirements: 5.1, 5.4, 5.6, 11.5_

  - [x] 5.23 Checkpoint: MVP regression with all flags off
    - Run root `npm test` and `npm run typecheck` with every flag off. All MVP tests pass unchanged. Ask the user if questions arise.
    - _Requirements: 3.1, 3.6_

  - [x] 5.24 Checkpoint: digest with its flag on
    - Run Properties 5 to 10, the API, Poller, component and axe tests with `digests` on, plus the branch integration tests. All pass. Ask the user if questions arise.
    - _Requirements: 3.6, 6.3_

  - [x] 5.25 Merge the digest into `main` (local merge, no push; needs user approval)
    - Ask the user to approve first. The new cron `0 * * * *` registers on the next production deploy even with the flag off, and the Poller then has three cron triggers. Ask the user to confirm the Cloudflare plan allows that trigger count, because a failed deploy on `main` would block everything. Run only before December 4, 2026, 2:00 PM PT. Confirm Tasks 5.22, 5.23 and 5.24 are done and that the other three features are merged. Merge this section's commits into `main` locally. Do not apply Migration 0005 to the production database, push, tag or deploy.
    - The commits stay one contiguous range, so `git revert` of that range removes the digest without touching the other features. The migration stays unapplied to production until the owner approves that step.
    - _Requirements: 4.9, 6.1, 6.2, 6.3, 6.4, 6.5, 6.7_

- [ ] 6. Final verification, documentation and rollout plan
  - [x] 6.1 Checkpoint: all flags off, full MVP suite
    - Run root `npm test`, `npm run typecheck` and the web build with every flag off. All MVP tests pass with no existing test file edited, deleted or skipped. Ask the user if questions arise.
    - _Requirements: 3.1, 3.2_

  - [x] 6.2 Checkpoint: all flags on, full suite and web build
    - Run root `npm test`, `npm run typecheck` and the web build with all four flags on. All pass. Ask the user if questions arise.
    - _Requirements: 3.6, 6.3_

  - [x] 6.3 Add the accessibility suite for every theme variant
    - Create `apps/web/test/a11y/themes/all-variants.test.tsx` that renders the Status, Airport, Watchlist (with the digest and webhook sections), Sign-in and unsubscribe pages with all flags on in `light`, `dark`, `hc-light` and `hc-dark` and fails on any violation.
    - _Requirements: 8.13, 9.11_

  - [x] 6.4 Update the README and the API documentation
    - Update `README.md` with the Phase 2 feature list, each flag and its default (off), and a link to `docs/webhooks.md`. Update `docs/api.md` with `GET /api/features` (200 body, 404 while all flags are off), the `/api/digest` and `/api/webhooks` routes, and a webhook receiver verification section with a TypeScript signature-check example, linking to `docs/webhooks.md`. Describe only features that are merged.
    - _Requirements: 15.7_

  - [x] 6.5 Update the Kiro usage and submission documents
    - Update `docs/kiro-usage.md` and `docs/devpost-submission.md` to mention a Phase 2 feature only if it is merged into `main`. Change nothing for unmerged features.
    - _Requirements: 6.1_

  - [x] 6.6 Write the production enable plan
    - Create `docs/phase2-rollout.md`: the order of production steps for each feature; the Worker variables to set (`FEATURE_*`, `SAFE_SEND_MODE`, `SAFE_SEND_ALLOWLIST_EMAILS`, `SAFE_SEND_ALLOWLIST_HOSTS`, the secret `WEBHOOK_MASTER_SECRET` of at least 32 characters); the migration and grants steps against the Production_DB, each needing the owner's approval; a check that the deploy workflow keeps dashboard variables not set in `wrangler.jsonc`; enabling with Safe_Send_Mode on, checking, then setting `SAFE_SEND_MODE=false` as a separate decision; and the rollback by flag, by `git revert`, and by deleting `phase-2`.
    - State that the project owner decides when to enable anything and pushes `main`.
    - _Requirements: 4.9, 5.3, 6.5, 6.7_

  - [-] 6.7 Final checkpoint: all tests pass
    - Root `npm test` and `npm run typecheck` pass in both flag states and the web build passes. Ask the user if questions arise.
    - _Requirements: 3.1, 3.6_

## Notes

- Every test sub-task is required. No sub-task is marked optional.
- Tasks marked **needs user approval**: 1.9 (production workflow edit), 1.10 (creates the Neon branch), 1.11 (deletes copied users on the branch), 4.25 and 5.10 (apply migrations to the branch), 5.25 (the new cron registers on the next production deploy).
- Tasks marked **needs user action**: 4.26 and 5.11 (grants in Neon), 4.37 (real Slack incoming-webhook check), 5.22 (local `wrangler dev --test-scheduled` run).
- Merge tasks 2.13, 3.9, 4.40 and 5.25 are local merges. The user pushes `main` once, at the end.
- Each property test carries the tag `// Feature: aerobrief-phase2, Property N: <title>` and runs with `numRuns` of 100 or more. Property 4 is implemented in Task 2.7 and extended in Task 3.3.
- Defaults used without a decision: webhook delivery rows are kept until the webhook or account is deleted, the digest hour preselects 07:00 UTC, and the digest retry waits are 1 and 3 seconds.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.8", "1.9"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5", "1.7", "1.10"] },
    { "id": 2, "tasks": ["1.6", "1.11"] },
    { "id": 3, "tasks": ["1.12"] },
    { "id": 4, "tasks": ["2.1", "2.2"] },
    { "id": 5, "tasks": ["2.3", "2.4", "2.5"] },
    { "id": 6, "tasks": ["2.6", "2.7", "2.8"] },
    { "id": 7, "tasks": ["2.9"] },
    { "id": 8, "tasks": ["2.10"] },
    { "id": 9, "tasks": ["2.11"] },
    { "id": 10, "tasks": ["2.12"] },
    { "id": 11, "tasks": ["2.13"] },
    { "id": 12, "tasks": ["3.1"] },
    { "id": 13, "tasks": ["3.2", "3.3", "3.4"] },
    { "id": 14, "tasks": ["3.5"] },
    { "id": 15, "tasks": ["3.6"] },
    { "id": 16, "tasks": ["3.7"] },
    { "id": 17, "tasks": ["3.8"] },
    { "id": 18, "tasks": ["3.9"] },
    { "id": 19, "tasks": ["4.1", "4.2", "4.24"] },
    { "id": 20, "tasks": ["4.3", "4.5", "4.9", "4.11", "4.14", "4.17", "4.19", "4.21", "4.25"] },
    { "id": 21, "tasks": ["4.4", "4.6", "4.7", "4.8", "4.10", "4.12", "4.13", "4.15", "4.16", "4.18", "4.20", "4.22", "4.23", "4.26", "4.28", "4.29"] },
    { "id": 22, "tasks": ["4.27", "4.30", "4.32", "4.36"] },
    { "id": 23, "tasks": ["4.31", "4.33", "4.34"] },
    { "id": 24, "tasks": ["4.35", "4.37"] },
    { "id": 25, "tasks": ["4.38"] },
    { "id": 26, "tasks": ["4.39"] },
    { "id": 27, "tasks": ["4.40"] },
    { "id": 28, "tasks": ["5.1", "5.9"] },
    { "id": 29, "tasks": ["5.2", "5.4", "5.7", "5.10"] },
    { "id": 30, "tasks": ["5.3", "5.5", "5.6", "5.8", "5.11", "5.13"] },
    { "id": 31, "tasks": ["5.12", "5.14", "5.15"] },
    { "id": 32, "tasks": ["5.16", "5.17", "5.18", "5.19", "5.20"] },
    { "id": 33, "tasks": ["5.21", "5.22"] },
    { "id": 34, "tasks": ["5.23"] },
    { "id": 35, "tasks": ["5.24"] },
    { "id": 36, "tasks": ["5.25"] },
    { "id": 37, "tasks": ["6.1"] },
    { "id": 38, "tasks": ["6.2"] },
    { "id": 39, "tasks": ["6.3", "6.4", "6.5", "6.6"] },
    { "id": 40, "tasks": ["6.7"] }
  ]
}
```
