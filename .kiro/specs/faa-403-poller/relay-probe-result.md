# Relay Probe Result

Task 10.3. Calls made by the owner on 2026-11-22 against the Vercel Preview deployment of branch `phase-2`. The secret values are not recorded here.

## Setup

| Item | Value |
| --- | --- |
| Vercel project | `aerobrief` (team `victor-8201`) |
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
4. **Two Vercel projects.** The account has two projects from this repo, `aerobrief` and `aero-brief`. Which one serves `www.aerobriefs.com` is not confirmed. This test used `aerobrief`. Confirm before task 18 so the Production secret goes to the right project.
5. The Preview-scope `FAA_RELAY_SECRET` is still to be deleted after task 14.
