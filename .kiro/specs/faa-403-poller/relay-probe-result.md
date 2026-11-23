# Relay Probe Result

Task 10.3. Calls made by the owner on 2026-11-22 against the Vercel Preview deployment of branch `phase-2`. The secret values are not recorded here.

## Setup

| Item | Value |
| --- | --- |
| Vercel project | `aerobrief` (team `victor-8201`), since deleted. Reconfirmed on `aero-brief`, see "Full relay". |
| Deployment | Preview, branch `phase-2`, commit `e41bc75` |
| URL | `https://aerobrief-git-phase-2-victor-8201.vercel.app/api/internal/faa-relay` |
| Function region | `iad1` (from `vercel.json`). The `x-vercel-id` header was not captured. |

## Results

| Call | Status | Body |
| --- | --- | --- |
| `GET`, no key | 401 | `{"error":"unauthorized"}` |
| `GET`, wrong (stale) key | 401 | `{"error":"unauthorized"}` |
| `GET`, correct `x-aerobrief-relay-key` | 200 | `{"upstreamStatus":200,"bytes":6041,"contentType":"application/json","snippet":"[{\"airportId\":\"LAS\",..."}` |

- `upstreamStatus`: **200**. Vercel's network reaches the FAA and gets JSON (`contentType: application/json`, 6041 bytes).
- The `405` call (`POST` with the key) was not run. Method handling is covered by the unit tests in task 12 and is checked again in task 14.

## Gate

**PASSED.** `upstreamStatus` is 200 with a JSON body, so requirement 2.7 does not apply. Work continues with task 11.

## Rewrite order

The unauthenticated call returned the function's own `401` JSON, not `index.html` and not the Worker's 404. Function routes take precedence over the `/api/:path*` rewrite and the `/(.*)` catch-all in `vercel.json` here. **No rewrite adjustment is needed.** Do not apply the adjustment from `design.md`.

## Body cap

Observed size is 6041 bytes, below the 256 KB threshold in `design.md`. Keep the default `RELAY_MAX_BODY_BYTES` of 1,048,576 in task 12.

## Notes for later tasks

1. **Preview protection.** The "Protection Bypass for Automation" header did not get through. The owner temporarily disabled Vercel Authentication on the project for this test. **The owner must re-enable it.**
2. **Redeploys.** The dashboard "Redeploy" asks for a TOTP 2FA code the owner does not have. A push to `phase-2` builds a Preview instead, but only if the commit touches `apps/web`. Vercel skipped an empty commit as "Not affected". Task 14 needs a commit that changes a file under `apps/web`.
3. **2FA on Production secrets.** The owner's Vercel account requires 2FA for some actions. Adding the Production `FAA_RELAY_SECRET` in task 18 may also prompt for it.
4. **Vercel projects.** This v0 gate ran on the `aerobrief` project, which the owner has since deleted. The only project now is `aero-brief` (team `victor-8201`), which serves `www.aerobriefs.com`. The result still stands and was confirmed again on `aero-brief` (see "Full relay"). The Production secret in task 18 goes to `aero-brief`.
5. The Preview-scope `FAA_RELAY_SECRET` is still to be deleted after go-live (task 18). See "Full relay".

## Full relay

Task 14. Calls made by the orchestrator on 2026-11-22 against the full relay, commit `92a35c5` on `phase-2`, built by Vercel project `aero-brief` (team `victor-8201`). The secret value is not recorded here.

### Setup

| Item | Value |
| --- | --- |
| Vercel project | `aero-brief` (the only project, serves `www.aerobriefs.com`) |
| Deployment | Preview, branch `phase-2`, commit `92a35c5` |
| URL | `https://aero-brief-git-phase-2-victor-8201.vercel.app/api/internal/faa-relay` |
| Function region | `iad1` (`x-vercel-id` of the form `cle1::iad1::...`) |

### Results

| Call | Status | Content type | Body |
| --- | --- | --- | --- |
| `GET`, correct key | 200 | `application/json` | Raw FAA JSON array, starting `[{"airportId":"LAS","groundStop":null,...`. No v0 wrapper. |
| `GET`, no key | 401 | `application/json` | `{"error":"unauthorized"}` |
| `POST`, correct key | 405 | `application/json` | `{"error":"method_not_allowed"}` |

- `Cache-Control: no-store` is present.
- **Module check passed.** The self-contained single-file relay runs on Vercel.
- **Routing.** The function wins over the `/api/:path*` rewrite. No rewrite change is needed.

### Corrections to earlier notes

- The `405` call skipped in task 10.3 is now run and passes.
- The open question about which project serves `www.aerobriefs.com` is closed. It is `aero-brief`.

### Remaining

1. Vercel Authentication on the `aero-brief` Preview was off during this check. **The owner must re-enable it.**
2. Delete the Preview-scoped `FAA_RELAY_SECRET` after go-live (task 18).
3. Delete `%USERPROFILE%\faa-relay-preview.txt`.
