# Implementation Plan

Write exploration and preservation tests before the fix. Run them on the unfixed code first. Tasks marked **NEEDS USER ACTION** or **NEEDS USER APPROVAL** must not run until the owner does them or approves. The owner may run those commands. Agents never push and never fast-forward `main`. Agents never read `.env` or `.dev.vars`.

**Status after the probe (2026-11-22).** The probe showed that headers do not fix the 403, and the owner chose a Vercel Function relay and approved the deviation from `tech.md` (see `bugfix.md` and `design.md`). The old Branch A tasks 2 and 5 (explicit headers) are **removed and skipped**: `probe-result.md` ruled headers out. Old task 7 (checkpoint) is now task 17 and old task 8 (ship) is now task 18. Numbers 2, 5, 7 and 8 are not used.

**Gate.** Tasks 11 to 18 start only after task 10.3 shows that Vercel's network gets HTTP 200 from the FAA. If it does not, stop and report to the owner (requirement 2.7). Tasks 3, 4 and 6 do not depend on the gate and may be done at any time.

- [x] 1. Diagnostic: find out why the FAA returns 403 to Workers
  - Throwaway Worker `aerobrief-faa-probe`. Never a production Worker name, `workers.dev` only, no bindings, no secrets, no cron.
  - Source in `tools/faa-probe/`, outside `apps/*` and `packages/*`, not in `deploy-workers.yml`.

  - [x] 1.1 Write the Probe source
    - `tools/faa-probe/src/index.ts`, `wrangler.jsonc`, `tsconfig.json` (strict, extends the repo base)
    - On an HTTP request, call the FAA URL three ways: no headers; `User-Agent: AeroBrief/1.0 (+https://www.aerobriefs.com)` plus `Accept: application/json`; a browser-like `User-Agent`
    - Return per variant: status, allow-listed response headers (`server`, `via`, `cf-ray`, `content-type`, `retry-after`, `x-akamai-*`, `x-amzn-*`, `x-cache`, `x-served-by`), and the first 300 characters of the body. Also return the Probe's own `cf-ray` and `request.cf?.colo`
    - Add `tools/faa-probe/tsconfig.json` to the root `typecheck` script. Run `npm run typecheck` and `npx vitest --run tests/repo-guard.test.ts tests/deploy-guard.test.ts`
    - Confirm `.github/workflows/deploy-workers.yml` does not mention `tools/` or `aerobrief-faa-probe`
    - _Requirements: 3.4, 3.7_

  - [x] 1.2 Deploy the Probe and call it. **NEEDS USER APPROVAL**
    - Owner approves, then runs: `npx wrangler deploy --config tools/faa-probe/wrangler.jsonc`
    - Owner opens the printed `workers.dev` URL (or an agent does, after approval) and saves the JSON
    - Do not share the URL publicly

  - [x] 1.3 Record the result
    - Write `.kiro/specs/faa-403-poller/probe-result.md`: the three statuses, the blocker headers, the body snippets, the colo, and which hypothesis from `design.md` fits
    - State the branch: **A** (an explicit-header variant returns 200) or **B** (all three return 403 or another block)
    - If the Probe returns 200 for everything, say that the Probe does not reproduce production, and ask the owner how to proceed

  - [x] 1.4 Delete the Probe. **NEEDS USER APPROVAL**
    - Owner approves, then runs: `npx wrangler delete --name aerobrief-faa-probe`
    - Confirm in the Cloudflare dashboard that the Worker is gone. Keep `tools/faa-probe/` in git only if the owner wants it kept as a diagnostic, otherwise remove it in the fix commit

  - [x] 1.5 Decision gate
    - Resolved. Result: Branch B (all three variants returned 403, `probe-result.md`). Branches A tasks 2 and 5 are skipped and removed.
    - Owner decision 2026-11-22: option 2, a Vercel Function relay. The owner approved the deviation from `tech.md`. Work continues with tasks 6 and 10 to 18.

- [x] 3. Write preservation property tests (BEFORE implementing the fix)
  - **Property 2: Preservation** - Poller behavior outside the bug
  - **IMPORTANT**: Observation-first. Run the unfixed code with non-403 inputs and record what it returns
  - Observe: status 500, 404, 429 give `{ ok: false, kind: "http_status", detail: "HTTP <status>" }`. A thrown `TimeoutError` gives `timeout`. A thrown other error gives `network`. An invalid body gives `unparseable` or `validation`. None throws
  - Write `apps/poller/test/faa-client.pbt.test.ts` (fast-check): for any status code, error or body, `fetchFaa` returns the observed typed result and never throws
  - Write a property: across generated poll runs with a recording fetch function and no relay config, every URL called has host `nasstatus.faa.gov` and equals `FAA_API_URL`. This is the direct-mode property. Task 15 keeps it passing and adds the relay-mode property next to it
  - Confirm existing `faa-client.test.ts`, `poll.test.ts`, `outcome.pbt.test.ts` and `tests/flags-off-guard.test.ts` pass
  - Run on unfixed code. **EXPECTED OUTCOME**: PASS
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [x] 4. Log a rate-limited warning on non-2xx (all branches)
  - **Property 3: Observability** - Non-2xx is visible and rate-limited
  - Independent of the cause. It also makes a failing relay visible

  - [x] 4.1 Add the pure decision function and its tests
    - `packages/core/src/upstream-warning.ts`: `shouldWarnUpstreamFailure(previous, now)`. Export it from `@aerobrief/core`
    - `packages/core/test/upstream-warning.test.ts`: null previous, previous success, previous failed in the same UTC hour, previous failed in an earlier UTC hour, exactly on the hour boundary
    - `packages/core/test/upstream-warning.pbt.test.ts` (fast-check): over generated outcome sequences at 5-minute steps, a failure after a success or at the start always warns, and a continuing failure warns at most once per UTC hour
    - Pure: no I/O, no env, imports only from itself
    - _Requirements: 1.3, 2.3_

  - [x] 4.2 Add the repository read
    - `packages/db/src/repositories/job-runs.ts`: `latestPollRun()` returns the newest `job = "poll"` row as `{ outcome, startedAt }` or null. No schema change, no migration
    - Add it to the repositories object and to `PollRepositories` in `apps/poller/src/poll.ts` (`Pick<..., "recordFailure" | "latestPollRun">`)
    - Add a test in `packages/db/test/` in the style of the existing job-runs repository tests
    - _Requirements: 2.3_

  - [x] 4.3 Wire the warning into `runPoll`
    - In `fail(...)`, for `kind === "http_status"`: read `latestPollRun()` before recording the failure, call `shouldWarnUpstreamFailure`, and if true call `logger.warn("faa_upstream_non_2xx", { kind, detail })`
    - No headers, no env, no secrets in the log. If the read throws, warn anyway and still record the failure unchanged
    - Tests in `apps/poller/test/poll.test.ts`: first 403 logs once; a second 403 in the same hour does not; a 403 in the next hour does; the log line contains no secret; a throwing `latestPollRun` still records the failed `job_run`; a 200 poll logs nothing
    - Update test fakes of `PollRepositories` that the type change breaks
    - _Requirements: 1.3, 2.3, 3.2_

- [x] 6. Record the owner's decision and the `tech.md` deviation (replaces "stop and present options")
  - The owner chose option 2 (Vercel Function relay) and approved the deviation on 2026-11-22. This task writes it down where `tech.md` requires it. No code
  - Wording must say: what is outside the stack, why (probe evidence), which in-stack options were considered, and the scope limit (one function, one fixed URL). Use the deviation record table in `design.md`
  - Scraping, FAA SWIM and other data sources stay prohibited by `scope.md` and are not part of this

  - [x] 6.1 Add the entry to `docs/decisions.md`
    - A new dated section "2026-11-22: Vercel Function relay for the FAA poll (approved deviation from tech.md)", in the style of the existing entries (table plus short notes)
    - Include: what is outside the stack; why (all three probe variants got 403 "Access Denied" from Cloudflare colo DFW on 2026-11-21, the same URL returns 200 from the owner's machine); in-stack options considered (request headers, ruled out by the probe; contacting the FAA, possible later but not before December 4, 2026; GitHub Actions schedule, unreliable); the approval; the rollback (unset `FAA_RELAY_URL` and `FAA_RELAY_SECRET`); link to this spec and to `probe-result.md`
    - _Requirements: 3.4_

  - [x] 6.2 Add an "Approved exceptions" note to `.kiro/steering/tech.md`
    - A short section at the end, after "Deployment". It names this one exception, says it does not widen the stack ("one Vercel Function, `apps/web/api/internal/faa-relay.ts`, one fixed upstream URL"), and points to `.kiro/specs/faa-403-poller/design.md`
    - Do not change any other line of `tech.md`
    - _Requirements: 3.4_

- [x] 9. Housekeeping, independent of the 403 fix: update `docs/phase2-rollout.md` section 3.2
  - Can be done at any time and does not depend on tasks 1 to 8. Change only section 3.2 and the Step 1 and Step 2 instructions in section 4. The rest of the document stays
  - Record the verified result from 2026-11-21: a manual "Deploy Workers" run removed the dashboard-only text variable `ROLLOUT_CHECK` on both Workers. The secrets `DATABASE_URL`, `RESEND_API_KEY` and `UNSUBSCRIBE_SECRET` survived. Replace the "as far as I know" and "Run the check below" wording with this result
  - Record the owner's choice: store `FEATURE_*` flags (and similarly `SAFE_SEND_*` settings) as Worker secrets with `npx wrangler secret put <NAME> --name <worker>`, typed at the prompt and not piped, because a trailing line ending makes the value not exactly `true`. Remove with `wrangler secret delete`. `/api/features` shows which flags are on
  - Record that `FEATURE_DARK_MODE` was set to `true` on `aerobrief-api` on 2026-11-21 and verified through `/api/features`
  - Update Step 1 (dark mode) and Step 2 (high contrast): "Do" says set the secret with `wrangler secret put`, "Undo" says `wrangler secret delete` (or put `false`)
  - Keep the fail branch options of the check, but mark the secrets route as the chosen one
  - No agent sets any variable or secret. This task only edits the document
  - _Requirements: 3.6_

- [x] 10. Relay probe: does Vercel's network get HTTP 200 from the FAA? (the gate)
  - Deploy a minimal relay to a Vercel **Preview** deployment first and call it. Nothing in the poller changes in this task. If Vercel's egress is also denied, stop and report (requirement 2.7)

  - [x] 10.1 Write the minimal relay (version 0) and its project wiring
    - `apps/web/api/internal/faa-relay.ts`: `export default { async fetch(request: Request): Promise<Response> { ... } }`, Node.js runtime (no `runtime` setting, no Edge). Self-contained, with no import from `@aerobrief/core`, so a module-resolution problem cannot hide the egress result
    - Behavior: `GET` only (else 405); header `X-AeroBrief-Relay-Key` compared with `process.env.FAA_RELAY_SECRET` by a simple constant-time loop (missing or wrong: 401, no FAA call, and if the env var is missing or shorter than 32 characters: 500, no FAA call); then fetch only the constant `https://nasstatus.faa.gov/api/airport-events` with a 10 s timeout and the AeroBrief `User-Agent` and `Accept: application/json`
    - Return JSON `{ upstreamStatus, bytes, contentType, snippet }` where `snippet` is the first 300 characters of the body, with `Cache-Control: no-store`. Never log or return the secret or request headers. This version is for the probe only and is replaced in task 13
    - `apps/web/api/tsconfig.json` (strict, extends `../../../tsconfig.base.json`, `lib` ES2022 and DOM, `types: []`) and `apps/web/api/env.d.ts` declaring only `process.env` (no `@types/node`, no new dependency). Add the tsconfig to the `typecheck` script of `apps/web/package.json` and to the `typecheck` matrix in `.github/workflows/ci.yml`
    - `apps/web/vercel.json`: add `"functions": { "api/internal/faa-relay.ts": { "maxDuration": 15, "regions": ["iad1"] } }`. Leave every `rewrites` entry as it is
    - Run `npm run typecheck`, then `npx vitest --run tests/repo-guard.test.ts tests/deploy-guard.test.ts tests/import-rules.test.ts`. The guards must pass (strict tsconfig, no `.js` files, `deploy-workers.yml` unchanged)
    - Do not commit to `main`. Commit on `phase-2` only when the owner asks
    - _Requirements: 2.2, 3.7, 3.8_

  - [x] 10.2 Deploy the Preview and prepare the call. **NEEDS USER ACTION**
    - Owner generates a **throwaway** Preview secret (clipboard only, not shown). PowerShell 5.1 and 7:
      ```powershell
      $b = New-Object byte[] 48
      $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
      $rng.GetBytes($b); $rng.Dispose()
      $s = ([Convert]::ToBase64String($b) -replace '[+/=]', '')
      Set-Clipboard -Value $s
      "Copied $($s.Length) characters to the clipboard."
      ```
    - In the Vercel dashboard (project settings, Environment Variables), add `FAA_RELAY_SECRET` with the **Preview** scope only (branch `phase-2`), paste the value, save. A new variable applies to the next deployment, so deploy after adding it
    - Preview deployments are protected by default. In the dashboard, Settings, Deployment Protection, add a "Protection Bypass for Automation" secret and copy it (`x-vercel-protection-bypass` header). Or turn off Vercel Authentication for Preview while testing and turn it back on after
    - Owner pushes the branch to get a Preview build: `git push origin phase-2`. A `phase-2` push does not deploy Workers (the workflow job runs only on `main`). Copy the Preview URL from the Vercel dashboard (Deployments)
    - Clear the clipboard afterwards: `Set-Clipboard -Value ' '`
    - _Requirements: 2.2_

  - [x] 10.3 Call the Preview relay and record the result (the gate)
    - Calls (PowerShell, `curl.exe`; keep the secret in session variables, not in the command text):
      ```powershell
      $env:RELAY_KEY = Get-Clipboard        # paste the throwaway secret first, or type it
      $env:BYPASS = "<bypass secret>"
      curl.exe -s -i "https://<preview-host>/api/internal/faa-relay" -H "x-vercel-protection-bypass: $env:BYPASS"
      curl.exe -s -i -X POST "https://<preview-host>/api/internal/faa-relay" -H "x-vercel-protection-bypass: $env:BYPASS" -H "X-AeroBrief-Relay-Key: $env:RELAY_KEY"
      curl.exe -s -i "https://<preview-host>/api/internal/faa-relay" -H "x-vercel-protection-bypass: $env:BYPASS" -H "X-AeroBrief-Relay-Key: $env:RELAY_KEY"
      Remove-Item Env:RELAY_KEY, Env:BYPASS
      ```
    - Expect in order: `401` JSON from the function (proves the function is not swallowed by the `/api/:path*` rewrite or the `/(.*)` catch-all, and that it is not `index.html` and not the Worker's 404); `405`; `200` with `upstreamStatus: 200` and JSON bytes
    - Write `.kiro/specs/faa-403-poller/relay-probe-result.md`: the three statuses, `upstreamStatus`, `bytes` (this sets the body cap, see `design.md`), the Vercel region shown in the response headers (`x-vercel-id`), and whether the rewrite order needed the adjustment in `design.md`
    - If `/api/internal/faa-relay` returned `index.html` or the Worker's 404 on the first call: apply the rewrite adjustment from `design.md` (only the `/api/:path*` source), redeploy and call again. Record it
    - **Gate:** `upstreamStatus` 200 and valid JSON: continue with task 11. Any other `upstreamStatus` (for example 403 and an "Access Denied" page): **stop, make no further change, and report to the owner** with the Reference numbers and the Vercel region (requirement 2.7)
    - Delete the Preview-scope `FAA_RELAY_SECRET` in the dashboard when the Preview checks are finished (task 14)
    - _Requirements: 2.2, 2.7, 3.8_

- [x] 11. Write bug condition exploration test (replaces the headers exploration test)
  - **Property 1: Bug Condition** - Poll reaches the FAA through the relay
  - **CRITICAL**: This test MUST FAIL on unfixed code. Do not fix the code when it fails
  - **GOAL**: Show that `fetchFaa` today has no relay path: it always calls the FAA URL and never sends a key header
  - **Scoped PBT Approach**: The bug is deterministic, so scope the property to the one request `fetchFaa` makes when a valid relay config is given
  - In `apps/poller/test/faa-client.test.ts`, with a recording fetch function and a generated valid relay config (URL `https://www.aerobriefs.com/api/internal/faa-relay`, secret of 32 to 80 generated characters): assert `fetchFaa(fetchFn, relay)` calls exactly `relay.url`, with `init.headers["x-aerobrief-relay-key"]` equal to the secret and an `AbortSignal`
  - The test calls the new two-argument `fetchFaa` signature. Write it so it compiles against a stub of the new signature, or use a cast, so it fails by assertion and not by a type error. Document the counterexample (for example "called `https://nasstatus.faa.gov/api/airport-events` with no headers")
  - Run on UNFIXED code. **EXPECTED OUTCOME**: FAILS
  - _Requirements: 1.1, 1.4, 2.1_

- [x] 12. Pure relay logic in `packages/core`

  - [x] 12.1 Add `packages/core/src/faa-relay.ts` and its unit tests
    - Constants, `timingSafeEqualStrings`, `decideRelayRequest`, `shapeRelayResponse`, `relayEnvSchema`, `resolveRelayConfig` as listed in `design.md`. Pure: no I/O, no env, no network, imports only from itself and Zod
    - Add `"./faa-relay": "./src/faa-relay.ts"` to the `exports` of `packages/core/package.json`. Also export from the core index for the poller
    - `packages/core/test/faa-relay.test.ts`: the cases listed in `design.md` (405, 401, 500, fetch; 2xx and non-2xx shaping, 300-character cut; 31 and 32 character secrets; `http:` URL, other host, `www.aerobriefs.com.evil.com`, userinfo, port, short secret, one setting only, both unset)
    - Set `RELAY_MAX_BODY_BYTES` from the size recorded in task 10.3 (default 1,048,576)
    - _Requirements: 2.2, 2.5, 2.6_

  - [x] 12.2 Property tests for the relay logic
    - `packages/core/test/faa-relay.pbt.test.ts` (fast-check): `timingSafeEqualStrings(a, b) === (a === b)` for generated strings; `decideRelayRequest` returns `fetch` only for `GET` with a key equal to the secret; `resolveRelayConfig` returns `relay` only for `https` URLs on exactly `www.aerobriefs.com` with a secret of at least 32 characters, and never includes a value in `invalid`
    - _Requirements: 2.2, 2.5_

- [x] 13. Full relay function in `apps/web/api`

  - [x] 13.1 Replace the version 0 handler with the full relay
    - `apps/web/api/internal/faa-relay.ts`: `createRelayHandler({ env, fetchFn })` plus the default export `{ fetch }` wired to the real `fetch` and `process.env`. Imports only `@aerobrief/core/faa-relay`. Follow steps 1 to 9 of the behavior list in `design.md`: env validated with Zod, `GET` only, constant-time key check, fixed URL and fixed headers, 10 s timeout, byte-capped body read, status pass-through, `Cache-Control: no-store`, one log line per outcome without the secret
    - Keep `apps/web/vercel.json` `functions` entry and any rewrite adjustment that task 10.3 needed
    - If the function build fails on the `@aerobrief/core/faa-relay` import in Preview, use the fallback in `design.md` (pure file under `apps/web/relay/` plus a sync test) and tell the owner
    - `apps/web` imports nothing from `packages/db` or `apps/poller`. Run `npm run typecheck` and the guards
    - _Requirements: 2.2, 2.6, 3.8_

  - [x] 13.2 Unit tests for the handler
    - `apps/web/test/faa-relay.test.ts` with `// @vitest-environment node`. Injected `fetchFn`. Cases: wrong method (405, no fetch call, `Allow: GET`), missing key (401, no fetch call), wrong key (401), missing or short secret env (500 `relay_misconfigured`, no fetch call), right key and FAA 200 (200, JSON, `Cache-Control: no-store`), FAA 403 (403 and a text excerpt of at most 300 characters), timeout (504), network error (502), body over the cap (502), and that the secret is absent from every response and every captured log line
    - _Requirements: 2.2, 2.6_

  - [x] 13.3 Property tests for the handler
    - **Property 4: Relay is not an open proxy** and **Property 6: The secret never leaks** (relay side)
    - `apps/web/test/faa-relay.pbt.test.ts` (fast-check, `// @vitest-environment node`): over generated requests (method, path suffix, query, headers, body) and generated secrets, a recording `fetchFn` is called zero times or once, only with the FAA URL, and the call carries none of the caller's URL parts, query or headers. It is called only for `GET` with the right key. The secret never appears in a response (body or headers) or in captured log lines
    - _Requirements: 2.2, 2.6_

- [x] 14. Full relay on Preview: routing and module check. **NEEDS USER ACTION**
  - Owner pushes `phase-2` again (new Preview) with the Preview-scope `FAA_RELAY_SECRET` still set
  - Repeat the three calls from task 10.3 (401, 405, 200) against the full relay. Expect the `200` response to be the FAA body as JSON with `Cache-Control: no-store`
  - Also check that nothing else changed: `GET https://<preview-host>/api/health` returns `{"status":"ok"}` from the Worker, `GET https://<preview-host>/sign-in` returns the app's `index.html`, and the home page loads. Add the result to `relay-probe-result.md` under a "Full relay" heading
  - If the build or the function fails on the core import, follow the fallback in `design.md`
  - When done, the owner deletes the Preview-scope `FAA_RELAY_SECRET` in the Vercel dashboard
  - _Requirements: 2.2, 3.8_

- [x] 15. Fix: the poller uses the relay when configured

  - [x] 15.1 Implement the fix
    - `apps/poller/src/env.ts`: add optional `FAA_RELAY_URL?: string` and `FAA_RELAY_SECRET?: string` to `Env`. Do not add them to the required `envSchema`
    - `apps/poller/src/faa-client.ts`: `fetchFaa(fetchFn, relay?)`. Without `relay`, the same URL and init as today. With `relay`, call `relay.url` with `{ signal, headers: { "x-aerobrief-relay-key": relay.secret, Accept: "application/json" } }`, same 10 s timeout, same `parseFaaBody`, same failure kinds, never throws. `FetchFn`'s init type gains an optional `headers`. Keep `FAA_API_URL` exported
    - `apps/poller/src/poll.ts`: call `resolveRelayConfig({ url: env.FAA_RELAY_URL, secret: env.FAA_RELAY_SECRET })` before `fetchFaa`. `invalid`: `logger.error("faa_relay_config_invalid", { keys })` and `fail("validation", "Invalid relay settings: <keys>")`, no outbound request, lease released. `relay`: pass it on. `direct`: as today. Add a non-empty `FAA_RELAY_SECRET` to the logger's secret list
    - Fail closed, not fall back (reasons in `design.md`). Both settings unset is not invalid
    - Do not change the timeout, the result types, the error mapping or anything in the notifier and webhooks
    - _Bug_Condition: isBugCondition(input) where the runtime is Cloudflare Workers and the FAA answers 403_
    - _Expected_Behavior: with a valid relay config the request goes to the relay URL with the key header, a 200 gives a Snapshot and a success job_run_
    - _Preservation: FAA URL or the one relay URL only, never throws, same failure recording, flags-off equals MVP, relay unset equals today_
    - _Requirements: 2.1, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3_

  - [x] 15.2 Verify the bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Poll reaches the FAA through the relay
    - Re-run the SAME test from task 11. Do not write a new test
    - **EXPECTED OUTCOME**: PASSES
    - _Requirements: 2.1_

  - [x] 15.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Poller behavior outside the bug
    - Re-run the SAME tests from task 3 (direct mode). **EXPECTED OUTCOME**: PASS
    - Run `npm test` and `npm run typecheck`

  - [x] 15.4 Add the relay-mode destination and secret property tests
    - **Property 5: The poller calls only the FAA URL or the configured relay URL**
    - In `apps/poller/test/faa-client.pbt.test.ts` and `apps/poller/test/poll.test.ts`: for generated relay configs (unset, valid, invalid) and generated FAA or relay responses, every URL called is `FAA_API_URL` (unset), the configured relay URL (valid), or no call is made (invalid, with a failed `job_run` of `failure_kind=validation` whose `detail` names only keys). Cases: only one setting set, `http:` URL, `https://www.aerobriefs.com.evil.com/...`, `https://evil.example/...`, userinfo, short secret
    - **Property 6: The secret never leaks** (poller side): `apps/poller/test/relay-secret.pbt.test.ts` generates secrets (32 or more characters) and failure outcomes (HTTP statuses, thrown errors whose message contains the secret, unparseable bodies that echo it). The secret and its substrings of 8 or more characters are absent from the `detail` passed to `recordFailure` and from every logger call
    - A test that the poller never sends the key header to the FAA URL in direct mode
    - _Requirements: 2.4, 2.5, 2.6, 3.1_

- [x] 16. Docs for the new variables and the relay
  - `README.md`: in the environment variables section list `FAA_RELAY_URL` and `FAA_RELAY_SECRET` (poller Worker secrets) and `FAA_RELAY_SECRET` (Vercel, Production), say they are optional and that unset means direct mode. In the stack section add a one-line pointer to the approved exception in `docs/decisions.md`. Placeholders only, no values
  - `docs/production-runbook.md`: a new section "FAA relay": what it is, the three variables and where each one lives, the secret generation command (clipboard version from task 10.2), the order of steps (push, check relay, set secrets, check), how to check (`curl.exe` with and without the key), what each relay status in `job_runs` means (`HTTP 401` secret mismatch, `HTTP 405` wrong method, `HTTP 500` relay secret missing or short on Vercel, `HTTP 502` or `504` FAA unreachable or slow, `HTTP 403` the FAA denied Vercel's egress, `validation` with `Invalid relay settings` a bad Worker setting), and the rollback (delete the two Worker secrets)
  - `docs/phase2-rollout.md`: add the two poller secrets to the variables table in section 3.1 (poller only, stored as secrets, optional). Change nothing else
  - No file in the repo gets a real secret value
  - _Requirements: 2.4, 3.4_

- [x] 17. Checkpoint - Ensure all tests pass
  - Run `npm test` and `npm run typecheck`. `tests/repo-guard.test.ts`, `tests/deploy-guard.test.ts`, `tests/import-rules.test.ts` and `tests/flags-off-guard.test.ts` must pass. Ask the owner if questions arise
  - Remove `tools/faa-probe/` and its entry in the root `typecheck` script, unless the owner wants it kept (task 1.4). Confirm `deploy-workers.yml` is unchanged
  - Commit on branch `phase-2` (no push)

- [-] 18. Ship and verify in production (owner steps). **NEEDS USER ACTION**
  - Only before December 4, 2026, 2:00 PM PT. The owner fast-forwards `main` from `phase-2` and runs `git push`. Agents do not push or fast-forward `main`
  - The push deploys the web app and the relay on Vercel, and the "Deploy Workers" run deploys both Workers. The owner checks that the run is green. The poller is still in direct mode: the relay settings are unset
  - Production relay check. Vercel Production needs `FAA_RELAY_SECRET`, set in the Vercel dashboard (Production scope only) and then redeployed (a new variable applies to the next deployment). Generate the value with the command in task 10.2 and keep it in the password manager. Then call `https://www.aerobriefs.com/api/internal/faa-relay`: no key gives `401`, `POST` gives `405`, the right key gives `200` and the FAA JSON
  - Set the poller secrets from `apps/poller` (typed at the prompt, not piped). Same value as Vercel Production:
    ```powershell
    $env:NODE_OPTIONS = "--use-system-ca"
    npx wrangler secret put FAA_RELAY_SECRET --name aerobrief-poller
    npx wrangler secret put FAA_RELAY_URL --name aerobrief-poller
    ```
    The URL value is `https://www.aerobriefs.com/api/internal/faa-relay`. Clear the clipboard: `Set-Clipboard -Value ' '`
  - After the next cron run the owner checks: the newest `job_runs` row is `success`, a row exists in `snapshots`, and `GET https://www.aerobriefs.com/api/status/national` returns `state: "ok"`. `https://www.aerobriefs.com` shows data
  - If it fails, read the `detail` of the newest `job_runs` row with the table in the runbook. Rollback: `npx wrangler secret delete FAA_RELAY_URL --name aerobrief-poller` and the same for `FAA_RELAY_SECRET`
  - If the warning log works, the Worker log shows `faa_upstream_non_2xx` while the relay or the FAA answers non-2xx
  - _Requirements: 2.1, 2.3, 2.4_
