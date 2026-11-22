# FAA 403 Poller Bugfix Design

## Overview

Every production poll gets HTTP 403 from the FAA, so no Snapshot is stored. The diagnostic is done (`probe-result.md`): the FAA edge answers "Access Denied" to all requests from Cloudflare Workers, with or without headers. The owner chose to relay the request through a Vercel Function and approved that deviation from `tech.md` on 2026-11-22.

The design has these parts:

1. **Relay.** A small Vercel Function in the existing Vercel project (`apps/web`) at `/api/internal/faa-relay`. It fetches the fixed FAA URL from Vercel's network and returns the result. It is protected by a shared secret and is not an open proxy.
2. **Relay probe first.** Before the poller is touched, a minimal relay is deployed to a Vercel **Preview** deployment and called, to prove that Vercel's network gets HTTP 200 from the FAA. If it does not, work stops and the owner is told.
3. **Poller change.** `fetchFaa` calls the relay when `FAA_RELAY_URL` and `FAA_RELAY_SECRET` are both set, and calls the FAA directly when both are unset. Unsetting them is the rollback.
4. **Warning log.** Independent of the cause, a rate-limited warning when the FAA (or relay) answers non-2xx, so a persistent failure shows in Worker logs.
5. **Records.** The deviation is recorded in `docs/decisions.md` and as an "Approved exceptions" note in `.kiro/steering/tech.md`. Docs list the new variables.

The fix is committed on `phase-2`. It is an MVP bugfix, not a Phase 2 feature, so it has no `FEATURE_*` flag. The owner fast-forwards `main` and pushes (agents cannot push or fast-forward `main`). The deadline for changes to `main` is December 4, 2026, 2:00 PM PT.

### Deviation record (required by `tech.md`)

| Question | Answer |
| --- | --- |
| What is outside the approved stack? | A Vercel Function used as a backend component. `tech.md` says "Cloudflare Workers for both the poller and the API" and uses Vercel only for the frontend. |
| Why is it needed? | The FAA edge denies requests from Cloudflare Workers egress. Evidence: `probe-result.md`, three variants, all HTTP 403 "Access Denied" from colo DFW on 2026-11-21, while the same URL returns 200 from the owner's machine. The live site shows no data because of it. |
| Which in-stack options were considered? | (a) Request headers on the Worker: ruled out by the probe, all three header variants got 403. (b) Contact the FAA to be allowed: possible later, but an answer is not expected before December 4, 2026. (c) A GitHub Actions scheduled job as the poller: GitHub's schedule is unreliable (delayed or skipped runs), and it would move the poller out of Cloudflare as well. |
| "No always-on servers" | The Vercel Function runs per request. It is not an always-on server. It is still a backend component outside Cloudflare Workers, which is why this is a deviation. |
| Who approved it, when? | The owner, explicitly, 2026-11-22. |
| Scope of the exception | One function, one fixed upstream URL. It does not permit other Vercel Functions or other backend logic. |

## Glossary

- **Bug_Condition (C)**: A poll request sent from the Cloudflare Workers runtime to the FAA URL is answered with 403.
- **Property (P)**: A poll stores a Snapshot and records a success `job_run`.
- **Preservation**: Behavior that must not change: FAA-host-or-relay-only calls, "never throws" in `fetchFaa`, failure recording in `runPoll`, 24 h retention, flags-off equals MVP, all existing web and API routes.
- **fetchFaa**: In `apps/poller/src/faa-client.ts`. Calls the FAA URL and returns a typed result. Never throws.
- **runPoll**: In `apps/poller/src/poll.ts`. One poll cycle: lease, `fetchFaa`, store or record a failed `job_run`.
- **Relay**: The Vercel Function `apps/web/api/internal/faa-relay.ts`, public path `/api/internal/faa-relay`.
- **Relay key**: The shared secret `FAA_RELAY_SECRET`, sent in the header `X-AeroBrief-Relay-Key`.
- **Relay config**: The pair `FAA_RELAY_URL` and `FAA_RELAY_SECRET` on the poller Worker. Both unset means direct mode.
- **Direct mode / relay mode**: The poller calls the FAA itself / calls the relay.
- **Probe**: The throwaway diagnostic Worker `aerobrief-faa-probe` (already run and deleted).
- **Relay probe**: The first relay deployed to a Vercel Preview deployment, to learn whether Vercel's network is denied too.

## Bug Details

### Bug Condition

```
FUNCTION isBugCondition(input)
  INPUT: input of type PollRequest { runtime, url, headers }
  OUTPUT: boolean

  RETURN input.url = "https://nasstatus.faa.gov/api/airport-events"
         AND input.runtime = CloudflareWorkers
         AND faaResponse(input).status = 403
END FUNCTION
```

The probe showed that `headers` does not matter: all three variants returned 403. The same URL from the owner's Windows machine returns 200. So the condition depends on the runtime's network.

### Examples

- Production cron at 2026-11-21 02:00 UTC: `fetchFaa` returns `{ ok: false, kind: "http_status", detail: "HTTP 403" }`, `job_runs` gets a failed row, `snapshots` stays empty. Expected: a Snapshot and a success row.
- Probe from Cloudflare (DFW), AeroBrief `User-Agent` plus `Accept`: HTTP 403, "Access Denied", Reference `18.2551db17.1795306310.bca222fd`. Expected after the fix: the poller never sends the FAA request from Cloudflare.
- `curl https://nasstatus.faa.gov/api/airport-events` on the owner's machine: 200 and valid JSON. Not affected.
- 289 consecutive 403 polls: the Worker log is empty. Expected: a warning on the first failure and then one per hour.
- FAA answers 500 once, then 200: one failed row, then a success row. Not affected, and no repeated warning.
- Relay settings unset: the poller calls the FAA directly, as before.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- The poller calls only `https://nasstatus.faa.gov/api/airport-events` (direct mode) or the one configured relay URL (relay mode). The relay calls only the FAA URL. No other host, no scraping, no FAA SWIM, no other data source.
- `fetchFaa` never throws and returns the same failure kinds and `detail` strings (`HTTP <status>`, timeout text, parse and validation details).
- `runPoll` records failures with the same `failure_kind` and `detail`, still releases the lease, and a notifier or webhook failure never fails the poll.
- A 200 with a valid body stores one Snapshot, its Events and a success `job_run` in one transaction.
- Cleanup keeps 24 hours of data, including `job_runs`.
- With every flag off, behavior equals the MVP.
- The web app's routes and DOM do not change. `/api/*` still reaches the API Worker. Every other path still serves `index.html`.

**Scope:** Everything except the poller's choice of destination (relay or direct), the new relay function, the new warning log and the docs is untouched. No schema change, no new table, no new runtime dependency.

## Hypothesized Root Cause

Narrowed by the probe (`probe-result.md`):

1. **Cloudflare egress range denied by the FAA edge (best fit).** The "Access Denied / Reference #18.x" page matches the standard Akamai edge denial format. This is an inference from the page format. No Akamai header confirmed it.
2. **Worker marker headers.** Cloudflare adds `CF-Worker`-style headers to subrequests, and a Worker cannot remove them. The probe cannot separate this from cause 1. The fix is the same.
3. **A rule change on the FAA side after 2026-11-17.** The smoke test passed around then. Possible as the trigger.
4. ~~Missing or non-descriptive request headers~~: **ruled out.** A descriptive and a browser-like `User-Agent` both got 403.

The relay is a bet that Vercel's network is not denied. That is not known yet. Vercel Functions run on cloud addresses (default region `iad1`), and a CDN that denies Cloudflare's range may deny cloud ranges too. The relay probe (task 10) tests this before any other work. If it fails, stop (requirement 2.7).

## Correctness Properties

Property 1: Bug Condition - Poll reaches the FAA through the relay and stores a Snapshot

_For any_ poll where relay mode is configured with a valid relay URL and secret, the fixed `fetchFaa` SHALL send exactly one request, to the configured relay URL, carrying the header `X-AeroBrief-Relay-Key` with the secret, with the 10 s timeout, and a 200 response with a valid body SHALL result in a stored Snapshot and a success `job_run`.

**Validates: Requirements 2.1**

Property 2: Preservation - Poller behavior outside the bug

_For any_ poll input where the bug condition does NOT hold (direct mode, any status, timeout, network error or body), the fixed code SHALL produce the same `fetchFaa` result and the same `runPoll` recorded outcome as the original, and SHALL only ever call the FAA URL.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**

Property 3: Observability - Non-2xx is visible and rate-limited

_For any_ sequence of poll outcomes, the warning decision SHALL return true when the previous poll run is absent or not failed, SHALL return true when the previous failed run is in an earlier UTC hour than now, and SHALL return false otherwise. So a continuing failure produces at most one warning per UTC hour.

**Validates: Requirements 1.3, 2.3**

Property 4: Relay is not an open proxy

_For any_ request to the relay (any method, path suffix, query string, headers and body), the relay SHALL call `fetch` at most once, only with the fixed FAA URL, with no caller-supplied URL, query or header forwarded. The relay SHALL call `fetch` only when the method is `GET` and the key header equals the secret. For a missing or wrong key it SHALL answer 401 and make no FAA call, and for a method other than `GET` it SHALL answer 405 and make no FAA call.

**Validates: Requirements 2.2**

Property 5: The poller calls only the FAA URL or the configured relay URL

_For any_ relay config (unset, valid, or invalid) and any FAA or relay response, every URL the poller calls SHALL be the FAA URL (direct mode) or the configured relay URL (relay mode), and SHALL be nothing (no call) when the config is invalid. An invalid config SHALL record a failed `job_run` with `failure_kind=validation` and a `detail` that names only the setting keys.

**Validates: Requirements 2.4, 2.5, 3.1**

Property 6: The secret never leaks

_For any_ secret string of 32 or more characters and any poll or relay outcome, the secret and any substring of 8 or more characters of it SHALL NOT appear in a `job_runs` row, a log field, a relay response body or header, or an error message.

**Validates: Requirements 2.2, 2.6**

## Fix Implementation

### Changes Required

#### 1. Relay function (new): `apps/web/api/internal/faa-relay.ts`

**File location and runtime.** Vercel builds one function for each supported source file in the root `api/` directory of the project. The Vercel project root is `apps/web`, so the folder is `apps/web/api/`. The Node.js runtime supports TypeScript files in `api/`. It is the default runtime for such files, so no `runtime` setting is needed, and the Edge runtime is not used. ([Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js))

**Handler signature.** The Node.js runtime supports the Web standard `fetch` export, so the handler is `export default { async fetch(request: Request): Promise<Response> { ... } }` and needs no `@vercel/node` types and no new dependency. ([Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js), [changelog](https://vercel.com/changelog/node-js-vercel-functions-now-support-fetch-web-handlers))

**Public path.** `/api/internal/faa-relay`. It does not collide with any API Worker route (a search of `apps/api/src` finds no `internal` route).

**Does the `/api/:path*` rewrite swallow it?** `apps/web/vercel.json` has `{ "source": "/api/:path*", "destination": "https://aerobrief-api.vamegah.workers.dev/api/:path*" }` and a catch-all `/(.*)` to `/index.html`. The Vercel docs say Vercel applies the first rewrite that matches a request ([Rewrites](https://vercel.com/docs/routing/rewrites)). Community sources and a Vercel-CLI issue say the filesystem (static files and functions) is checked before `rewrites` apply, which is why a SPA catch-all does not hide static assets ([randombits.dev](https://randombits.dev/articles/vercel-tips), [angular-cli #30736](https://github.com/angular/angular-cli/issues/30736)). The official pages read for this design do not state that rule in so many words, so it is **not assumed**. The relay probe and the full-relay Preview check test it: a request without the key must return `401` JSON from the function, not the Worker's 404 and not `index.html`.

- **If the function wins (expected):** no change to `vercel.json` rewrites.
- **If the rewrite wins:** change only the API rewrite source so that it skips the relay path: `{ "source": "/api/:path((?!internal/faa-relay$).*)", ... }`. Every other `/api/*` path matches as before, the catch-all and the other rewrites are untouched, and no component changes. Re-check with the same two requests, plus `GET /api/health` (Worker) and `GET /sign-in` (SPA).

**Function settings** in `apps/web/vercel.json`, a new `functions` entry (existing `rewrites` untouched):

```json
"functions": {
  "api/internal/faa-relay.ts": { "maxDuration": 15, "regions": ["iad1"] }
}
```

- `maxDuration: 15` keeps the function from running for the 300 s default (Hobby default and maximum) if the FAA hangs. The relay's own FAA timeout is 10 s. ([limits](https://vercel.com/docs/functions/limitations))
- `regions: ["iad1"]` pins Washington, D.C., the default for new projects. Hobby allows a single region. ([region docs](https://vercel.com/docs/functions/configuring-functions/region))
- The `functions` key takes a path relative to the project root. Task 10 checks that Vercel accepts it.

**Free plan limits.** On Hobby the included usage is 1,000,000 function invocations, 4 CPU-hours and 360 GB-hours of memory per month ([Hobby plan](https://vercel.com/docs/plans/hobby), [function pricing](https://vercel.com/docs/functions/usage-and-pricing)). The poller calls once every 5 minutes, which is 288 a day, about 8,640 a month, under 1% of the invocation allowance. The function waits on I/O, which does not count as active CPU. The Hobby plan is for non-commercial use. AeroBrief has no monetization (`scope.md`), so it fits. If billing is ever added (Phase 2), the plan must be reviewed. Hobby usage over the limits pauses the project for 30 days, and that would take the website down with it. Calls to the relay without the key are cheap, but they still count as invocations. The owner decides on a Vercel Firewall rate-limit rule for this path (see "Owner decisions").

**Behavior.** Each step happens in this order:

1. `FAA_RELAY_SECRET` is read from the environment and validated with Zod (`relayEnvSchema`, at least 32 characters). If invalid or missing: `500` `{"error":"relay_misconfigured"}`, naming no value, no FAA call, no secret in the log.
2. Method is not `GET`: `405` with `Allow: GET`, no FAA call. (`HEAD` is also 405.)
3. The key header is missing or not equal to the secret (constant-time compare): `401` `{"error":"unauthorized"}`, no FAA call.
4. `fetch("https://nasstatus.faa.gov/api/airport-events", { signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "AeroBrief/1.0 (+https://www.aerobriefs.com)", Accept: "application/json" } })`. The URL and headers are constants. Nothing from the incoming request (URL, path, query, headers, body) is used.
5. Timeout: `504` `{"error":"upstream_timeout"}`. Network error: `502` `{"error":"upstream_unreachable"}`. No stack, no message from the error in the response.
6. The body is read through a byte counter that stops at the cap. Over the cap: `502` `{"error":"upstream_too_large"}`.
7. 2xx from the FAA: the same status, the body, `Content-Type: application/json`, `Cache-Control: no-store`.
8. Non-2xx from the FAA: the same status, `Cache-Control: no-store`, and a body of at most the first 300 characters of the FAA body as `text/plain` (diagnostic only, like the probe). This keeps the FAA status visible to the poller (`HTTP 403`) without relaying a full HTML page under a JSON content type.
9. The function logs one line per outcome with the outcome code and the FAA status only (for example `relay_unauthorized`, `relay_upstream_status 403`). Never the secret, never request headers.

**Body cap.** The default is 1 MB (1,048,576 bytes). The relay probe records the real response size. If it is above 256 KB, raise the cap to four times the observed size, up to 4 MB, because Vercel's response body limit is 4.5 MB ([limits](https://vercel.com/docs/functions/limitations)). The cap is a constant in `packages/core`.

#### 2. Pure logic (new): `packages/core/src/faa-relay.ts`

Pure functions, no I/O, no env, imports only from itself and Zod. They are shared by the relay and the poller. Exported from a subpath `@aerobrief/core/faa-relay` (new entry in the `exports` map of `packages/core/package.json`) so the Vercel function bundle pulls in this one file and not the whole core index.

- Constants: `RELAY_KEY_HEADER = "x-aerobrief-relay-key"`, `RELAY_TARGET_URL` (the FAA URL), `RELAY_ALLOWED_HOST = "www.aerobriefs.com"`, `RELAY_SECRET_MIN_LENGTH = 32`, `RELAY_TIMEOUT_MS = 10_000`, `RELAY_MAX_BODY_BYTES`, `RELAY_ERROR_BODY_CHARS = 300`.
- `timingSafeEqualStrings(a, b): boolean`. Loops over the longer length, mixes the length difference into the result, and does not stop at the first difference.
- `decideRelayRequest({ method, providedKey, secret }): { action: "fetch" } | { action: "reject"; status: 401 | 405 | 500; error: string }`.
- `shapeRelayResponse({ upstreamStatus, bodyText }): { status: number; contentType: string; body: string }`. Applies steps 7 and 8.
- `relayEnvSchema` (Zod): `FAA_RELAY_SECRET` is a string of at least 32 characters.
- `resolveRelayConfig({ url, secret }): { mode: "direct" } | { mode: "relay"; url: string; secret: string } | { mode: "invalid"; keys: ("FAA_RELAY_URL" | "FAA_RELAY_SECRET")[] }`. Both absent (undefined or empty string): direct. One present: invalid, naming the missing key. `url` must parse, use `https:`, have host exactly `www.aerobriefs.com`, no credentials, no non-default port. `secret` must be at least 32 characters. Invalid values are never echoed.

Environment variables are read only in `apps/*` (structure.md). The functions take values as arguments.

Where the repo rule might bite: the Vercel Node.js runtime must resolve `@aerobrief/core/faa-relay`, a workspace package whose `exports` point at TypeScript source. Vercel's docs say TypeScript is supported in `api/`. They do not say that TypeScript files of workspace packages are compiled. Preview checks 10 and 14 test this. **If the build or the function fails on the import**, do not work around it silently. The fallback is to move the pure file to `apps/web/relay/faa-relay.ts` (outside `api/`, as Vercel recommends), keep the poller's copy of `resolveRelayConfig` in `packages/core`, and add a sync test in the style of `palette-sync.test.ts` that fails when the shared constants differ. Report the choice to the owner.

#### 3. Poller change

- `apps/poller/src/env.ts`: add optional `FAA_RELAY_URL?: string` and `FAA_RELAY_SECRET?: string` to `Env`. `envSchema` keeps its required keys. The two relay keys are read raw in `runPoll` and validated by `resolveRelayConfig`, not by `parseEnv`, so a bad relay setting records a failed `job_run` and does not throw before a row is written.
- `apps/poller/src/faa-client.ts`: `fetchFaa(fetchFn, relay?)`. With `relay` undefined it behaves exactly as today (same URL, same init). With relay set it calls `relay.url` with `{ signal, headers: { [RELAY_KEY_HEADER]: relay.secret, Accept: "application/json" } }`. Same 10 s timeout, same `parseFaaBody`, same failure kinds. Never throws. `FetchFn`'s init type gains an optional `headers`. `FAA_API_URL` stays exported, and a test asserts it equals `RELAY_TARGET_URL`.
- `apps/poller/src/poll.ts`: before `fetchFaa`, call `resolveRelayConfig`. `invalid`: write one `logger.error("faa_relay_config_invalid", { keys })` and call `fail("validation", "Invalid relay settings: <keys>")`, then return with the lease released as every other failure does. No outbound request is made. `relay`: pass it to `fetchFaa`. `direct`: as today. `FAA_RELAY_SECRET`, when non-empty, is added to the logger's redaction list.
- **Fail closed, not fall back.** An invalid relay setting stops the poll instead of falling back to a direct call, for two reasons. First, the direct call is known to return 403, so falling back would hide the misconfiguration behind an old, familiar failure. Second, the host check exists to protect the secret: a typo or a bad value in `FAA_RELAY_URL` must never cause the secret to be sent to another host, and a silent fallback would also make it hard to tell whether the relay is in use. Failing closed gives a visible, named error in `job_runs` and the log. Both settings unset is not invalid: that is the intended rollback state.
- The relay's own errors use distinct statuses (401, 405, 500, 502, 504). The poller turns any non-2xx into `HTTP <status>` as today, so `job_runs` shows the relay's status. The runbook lists what each status means.

#### 4. Secrets and variables

| Name | Where | Scope | Notes |
| --- | --- | --- | --- |
| `FAA_RELAY_SECRET` | Vercel project env var | Production only (and a separate throwaway value in Preview during the relay probe, deleted afterwards) | Set in the Vercel dashboard. A new env var applies to the next deployment, so redeploy after adding it. |
| `FAA_RELAY_SECRET` | Worker secret on `aerobrief-poller` | Production | `npx wrangler secret put FAA_RELAY_SECRET --name aerobrief-poller`, typed at the prompt. Same value as Vercel Production. |
| `FAA_RELAY_URL` | Worker secret on `aerobrief-poller` | Production | `https://www.aerobriefs.com/api/internal/faa-relay`. A secret, not a dashboard text variable, because `phase2-rollout.md` section 3.2 recorded that a Workers deploy removes dashboard-only text variables and keeps secrets. |

The secret has at least 32 characters. Both the relay and the poller reject shorter ones. The owner generates the value so it never appears in chat. This works in Windows PowerShell 5.1 and PowerShell 7, and puts the value on the clipboard, not on screen:

```powershell
$b = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($b); $rng.Dispose()
$s = ([Convert]::ToBase64String($b) -replace '[+/=]', '')
Set-Clipboard -Value $s
"Copied $($s.Length) characters to the clipboard."
```

Paste it into the password manager first, then into the Vercel dashboard, then at the `wrangler secret put` prompt. Afterwards clear the clipboard with `Set-Clipboard -Value ' '`. Use `$env:NODE_OPTIONS = "--use-system-ca"` before `wrangler` commands, as for the other secrets. Do not type the value on a command line.

#### 5. Repo guards and tooling

- `tests/repo-guard.test.ts` requires every `tsconfig*.json` to be strict and no `.js`, `.jsx`, `.mjs` or `.cjs` files. The new folder `apps/web/api/` has only `.ts` files and a `tsconfig.json` that extends `../../../tsconfig.base.json` (strict). Vercel's `api/` folder does not need compiled output, so nothing generated is committed.
- `apps/web/tsconfig.json` includes only `src`, `test` and `vite.config.ts`, so `apps/web/api/` is **not** type-checked by it. Add `apps/web/api/tsconfig.json` (strict, `lib` ES2022 and DOM for `Request` and `Response`, `types: []`, plus a small `env.d.ts` that declares `process.env`, like `tests/node-shim.d.ts`; `@types/node` is not a dependency and none is added). Add it to the `typecheck` script of `apps/web/package.json` and to the `typecheck` matrix in `.github/workflows/ci.yml`. The `deploy-workers.yml` workflow is not changed, and `tests/deploy-guard.test.ts` keeps passing.
- Vercel's TypeScript compiler reads `tsconfig.json` from the project root (`apps/web`). It does not support path mappings or project references. The relay uses neither.
- `apps/web` must not import `packages/db` or `apps/poller` (structure.md). The function imports only `@aerobrief/core/faa-relay` (already a dependency of `apps/web`).
- `tests/import-rules.test.ts` bans importing `@aerobrief/webhook-sender` from `apps/web` and `packages/core`. Not affected.
- `tools/faa-probe/` is a finished diagnostic. Task 17 deletes it and removes it from the root `typecheck` script, unless the owner wants it kept.
- Relay tests live in `apps/web/test/` and use `// @vitest-environment node`, because the web project defaults to jsdom and the relay needs the Node `Request` and `Response`. The handler takes its `fetch` as an argument (a factory `createRelayHandler({ env, fetchFn })`), and the default export wires in the real `fetch` and `process.env`.

#### 6. Warning log (all modes)

- `packages/core/src/upstream-warning.ts` (pure, no I/O): `shouldWarnUpstreamFailure(previous: { outcome: "success" | "failed"; startedAt: Date } | null, now: Date): boolean`. True when `previous` is null or not failed, or when `previous.startedAt` and `now` fall in different UTC hours. Exported from `@aerobrief/core`.
- `packages/db`: add `latestPollRun()` to the job-runs repository. It returns the newest `job = "poll"` row's `outcome` and `startedAt`, or null. A read of the existing table. No schema change.
- `apps/poller/src/poll.ts`: in `fail(...)`, when `kind === "http_status"`, read `latestPollRun()` before recording the failure, call the decision function, and if true call `logger.warn("faa_upstream_non_2xx", { kind, detail })`. `detail` is already `HTTP <status>`. No headers, no env, no URL. If the read throws, warn anyway and continue. The failure is still recorded exactly as today.

#### 7. Records and docs

- `docs/decisions.md`: a dated entry with the deviation record table above and a link to this spec.
- `.kiro/steering/tech.md`: a short "Approved exceptions" section naming this one exception and pointing to `.kiro/specs/faa-403-poller/design.md`. It must not widen the stack: one function, one fixed URL.
- `README.md` (environment variables, stack), `docs/production-runbook.md` (a section on the relay: variables, how to check it, how to roll back, what each relay status means), `docs/phase2-rollout.md` section 3.1 (variables per Worker table gains the two poller secrets).
- `docs/phase2-rollout.md` section 3.2 (task 9) is already done.

#### 8. Shipping and rollback

Order matters, because the poller's secrets must not be set before the relay is live in production:

1. Owner pushes `phase-2` to get a Vercel Preview deployment (task 10 and 14). A push of `phase-2` does not deploy Workers (the workflow job runs only on `main`).
2. After the checkpoint, the owner fast-forwards `main` and pushes (before the deadline). Vercel deploys the web app and the relay. The Workers workflow deploys the poller with the new code. The relay settings are still unset, so the poller is in direct mode and behaves as today.
3. The owner checks the production relay: no key gives 401, the right key gives 200 and JSON.
4. The owner sets the two poller secrets. Secrets take effect without a deploy.
5. Check after the next cron: newest `job_runs` row is `success`, `snapshots` has a row, `/api/status/national` returns `state: "ok"`.

**Rollback:** `npx wrangler secret delete FAA_RELAY_URL --name aerobrief-poller` and the same for `FAA_RELAY_SECRET`. The poller is back in direct mode within one cron cycle, no deploy needed. To remove the relay itself, delete or revert its files and let Vercel redeploy, and delete `FAA_RELAY_SECRET` in Vercel.

### Owner decisions

1. **Rate-limit rule for the relay path.** Hobby usage over the limits pauses the whole project, website included. Unauthenticated calls to the relay each count as an invocation. Option: a Vercel Firewall custom rule (rate limit or deny) on `/api/internal/faa-relay`. The owner decides, and sets it in the Vercel dashboard. Nothing in the repo depends on it.
2. **Non-2xx pass-through.** The relay returns the FAA status but only a 300-character text excerpt of a non-2xx body, not the full body. The owner asked to pass the body through. This is the smaller exposure. Say so if the full body is wanted.
3. **Fail closed on an invalid relay setting** (justified above) instead of falling back to a direct call. Say so if a fallback is wanted.
4. **If Vercel is denied too** the work stops. Remaining options are then the FAA contact (in stack) or another relay host (a second deviation, needs its own approval).

### Sources

Content was rephrased for compliance with licensing restrictions.

- Vercel, [Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js): functions in the root `api/` directory, TypeScript support, `fetch` Web standard export, shared code outside `api/`, tsconfig limits (no path mappings, no project references).
- Vercel changelog, [Node.js Vercel Functions now support fetch web handlers](https://vercel.com/changelog/node-js-vercel-functions-now-support-fetch-web-handlers).
- Vercel, [Functions limits](https://vercel.com/docs/functions/limitations): 300 s default and maximum duration on Hobby, 250 MB bundle, 4.5 MB response body, default region `iad1`.
- Vercel, [Configuring regions](https://vercel.com/docs/functions/configuring-functions/region): per-function `regions` in `vercel.json`, Hobby has a single region.
- Vercel, [Rewrites](https://vercel.com/docs/routing/rewrites) and [Routing](https://vercel.com/docs/routing): the first matching rewrite applies, external rewrites, same-application rewrites to a function.
- Vercel, [Hobby plan](https://vercel.com/docs/plans/hobby) and [Fluid compute pricing](https://vercel.com/docs/functions/usage-and-pricing): 1,000,000 function invocations, 4 CPU-hours, 360 GB-hours a month; limits pause the feature for 30 days. Non-commercial use only per the [Hobby plan fair use guidance](http://web.archive.org/web/20260208072336/https:/vercel.com/docs/plans/hobby).
- Vercel, [Protection Bypass for Automation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation): the `x-vercel-protection-bypass` header for protected Preview deployments.
- Community: [randombits.dev](https://randombits.dev/articles/vercel-tips) and [angular-cli #30736](https://github.com/angular/angular-cli/issues/30736) on the filesystem being checked before rewrites. Not stated on the official pages read, so tested in Preview.

## Testing Strategy

### Validation Approach

The first test is a real network call: the relay probe on a Vercel Preview deployment shows whether Vercel's network is allowed. No local test can show that. Then unit and property tests cover what the code controls, a second Preview check covers routing and module resolution of the full relay, and one production check closes it.

### Exploratory Bug Condition Checking

**Goal**: Learn whether Vercel's network gets 200 from the FAA, before building anything else.

**Test Plan**: Task 10. A minimal relay at the final path (self-contained, no `@aerobrief/core` import, key check, fixed URL, returns status, response size and first 300 characters) is deployed to a Preview deployment and called with and without the key. Results go to `.kiro/specs/faa-403-poller/relay-probe-result.md`.

**Test Cases**:
1. **No key**: expect 401 JSON from the function. Proves routing: the function is not swallowed by the `/api/:path*` rewrite or the catch-all.
2. **Wrong method (`POST`)**: expect 405.
3. **Right key**: expect 200 and JSON from the FAA. Proves Vercel egress is allowed. Record the body size for the cap.
4. **Right key, FAA denied**: a 403 and the Akamai "Access Denied" page means Vercel is denied too. Stop (requirement 2.7).

For the poller, a Vitest exploration test (task 11) asserts that with a valid relay config the fetch function is called with the relay URL and the key header. It fails on the current code, which has no relay support and calls the FAA URL.

**Expected Counterexamples**:
- `fetchFaa` calls the fetch function with the FAA URL and no key header, whatever the env says.
- Possible causes: see Hypothesized Root Cause.

### Fix Checking

```
FOR ALL input WHERE isBugCondition(input) AND relayConfigValid(env) DO
  call := fetchFaa'(input, relayConfig)
  ASSERT call.url = relayConfig.url
     AND call.headers[RELAY_KEY_HEADER] = relayConfig.secret
     AND call.timeout = 10000
END FOR
```

Unit tests prove the request shape. Only production proves the 403 is gone (task 18).

### Preservation Checking

```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT fetchFaa(input) = fetchFaa'(input)   // direct mode, relay config unset
END FOR
```

Property-based testing fits because the input space (status codes, bodies, thrown errors, relay configs) is wide. The preservation tests (task 3) are written and run on unfixed code first (observation-first).

**Test Cases**:
1. **Result mapping**: for any status code, thrown error name or body, `fetchFaa` returns the same typed result and never throws.
2. **FAA host only (direct mode)**: for any poll run with a recording fetch function and no relay config, every URL called equals `FAA_API_URL`.
3. **Failure recording**: `runPoll` with a failing fetch records the same `failure_kind` and `detail` and releases the lease (existing `poll.test.ts` and `outcome.pbt.test.ts` keep passing).

### Unit Tests

- `packages/core/test/faa-relay.test.ts`: `timingSafeEqualStrings` (equal, different length, one character different), `decideRelayRequest` (405, 401, 500, fetch), `shapeRelayResponse` (2xx, non-2xx excerpt, 300-character cut), `relayEnvSchema` (31 and 32 characters), `resolveRelayConfig` (both unset, one set, `http:`, other host, `www.aerobriefs.com.evil.com`, userinfo, port, short secret, valid).
- `apps/web/test/faa-relay.test.ts`: handler with injected `fetchFn`: every branch of the behavior list (steps 1 to 9), timeout, network error, body over the cap, secret absent from every response and log line.
- `apps/poller/test/faa-client.test.ts`: key header sent, relay URL called, 10 s signal, direct mode unchanged.
- `apps/poller/test/poll.test.ts`: invalid relay config records `validation` and makes no call; relay-mode success stores a Snapshot; the warning log cases (first 403 logs once, a second in the same hour does not, next hour does, no secret in the line, a throwing `latestPollRun` still records the failure, a 200 logs nothing).
- `packages/core/test/upstream-warning.test.ts`: null previous, previous success, same hour, earlier hour, hour boundary.

### Property-Based Tests

- `packages/core/test/upstream-warning.pbt.test.ts` (Property 3): over generated sequences of outcomes at 5-minute steps, a failure after a success or at the start always warns, and a continuing failure warns at most once per UTC hour.
- `packages/core/test/faa-relay.pbt.test.ts` (Property 4): `decideRelayRequest` returns `fetch` only for `GET` and a key equal to the secret, for generated methods, keys and secrets. `timingSafeEqualStrings(a, b)` equals `a === b` for generated strings. `resolveRelayConfig` returns `relay` only for `https` URLs on the allowed host with a secret of at least 32 characters.
- `apps/web/test/faa-relay.pbt.test.ts` (Properties 4 and 6): over generated requests (method, path, query, headers, body), a recording `fetchFn` is called zero times or once, only with the FAA URL, and its init carries no caller-supplied header. The generated secret never appears in the response or in captured log lines.
- `apps/poller/test/faa-client.pbt.test.ts` (Properties 2 and 5): result mapping never throws; every URL called is the FAA URL (relay unset) or the configured relay URL (relay set); no URL is called for an invalid config.
- `apps/poller/test/relay-secret.pbt.test.ts` (Property 6): for generated secrets and failure outcomes, the secret and its substrings of 8 or more characters are absent from the `job_runs` `detail` passed to `recordFailure` and from every logger call.

### Integration Tests

- Relay probe on Preview (task 10) and full relay check on Preview (task 14): `401`, `405`, `200`, the app's own routes still working (`/api/health` through the Worker, `/sign-in` from `index.html`).
- Production check by the owner after the push and after the secrets are set (task 18): `job_runs` shows `success`, `snapshots` has rows, `/api/status/national` returns `state: "ok"`.
- If production still shows a non-2xx after the relay is on, read the `job_runs` `detail` (`HTTP 401` means a secret mismatch, `HTTP 403` means the FAA denied Vercel's production egress too, `HTTP 404` or an `unparseable` failure means the route was not live or was swallowed by a rewrite). Report it. Do not guess.
