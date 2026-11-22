# FAA 403 Probe Result

Task 1.3. Worker `aerobrief-faa-probe`, deployed by the owner on 2026-11-21 at about 23:55 UTC and called by the orchestrator at its `workers.dev` URL. Raw output: `%TEMP%\faa-probe-result.json` (not committed).

## Setup

- URL probed: `https://nasstatus.faa.gov/api/airport-events`
- Probe cf-ray: `a5e3b8163fad6806`, colo: `DFW`

## Results

| Variant | Request headers | Status | Response cf-ray | Reference # |
|---|---|---|---|---|
| `no_headers` | none | 403 | `a5e3b8165bac69d8-DFW` | `18.2b51db17.1795306310.70cf39be` |
| `aerobrief_ua` | `User-Agent: AeroBrief/1.0 (+https://www.aerobriefs.com)`, `Accept: application/json` | 403 | `a5e3b8167bc069d8-DFW` | `18.2551db17.1795306310.bca222fd` |
| `browser_ua` | browser-like `User-Agent` | 403 | `a5e3b8169bd269d8-DFW` | `18.2b51db17.1795306310.70cf39f7` |

Response headers in all three: `server: cloudflare`, `content-type: text/html`, cf-ray ending `-DFW`. No `x-akamai-*` or `x-amzn-*` headers were returned.

Body in all three (first 300 characters): an HTML page titled "Access Denied" saying `You don't have permission to access "http://nasstatus.faa.gov/api/airport-events" on this server.` followed by `Reference #18.<hex>.<number>.<hex>`.

## Comparison with the owner's machine

On 2026-11-21 at about 02:05 UTC the same URL returned 200 with valid JSON from the owner's Windows machine (residential or office network), both with and without a `User-Agent`.

## Interpretation (not certain)

- The "Access Denied / Reference #18.x" page matches the standard Akamai edge denial format. The likely reading is that the FAA's CDN is Akamai and it denies requests from Cloudflare's egress. This is an inference from the page format. No Akamai header confirms it.
- `server: cloudflare` comes from Cloudflare's own outbound layer on the Worker response. It does not show that the FAA uses Cloudflare.
- Fit with the hypotheses in `design.md`: hypothesis 2 (Cloudflare egress range blocked) fits best. Hypothesis 1 (missing or non-descriptive headers) is ruled out, because a descriptive and a browser-like `User-Agent` both got 403. Hypothesis 3 (Worker marker headers such as `CF-Worker`) cannot be separated from 2 by this probe, and a Worker cannot remove them. Hypothesis 4 (an FAA rule change after 2026-11-17) is possible as the trigger and is not excluded.
- Limit: one colo (DFW) and one call. The production cron may run from another colo. Production is already failing with 403, which is consistent with this result.

## Branch decision

**Branch B.** All three variants returned 403. Headers do not fix it.

- Do not start Branch A tasks (2 and 5).
- Next: tasks 3 and 4, then task 6 (present options to the owner; do not choose for them).
- Task 1.4 (delete the Probe) still needs owner approval.

## For contacting the FAA or Akamai

Quote these Reference numbers, the time (2026-11-21, about 23:55 UTC), the target URL, and that the source was Cloudflare egress in DFW:

- `18.2b51db17.1795306310.70cf39be`
- `18.2551db17.1795306310.bca222fd`
- `18.2b51db17.1795306310.70cf39f7`
