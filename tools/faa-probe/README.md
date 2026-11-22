# faa-probe

Throwaway Worker `aerobrief-faa-probe`. It calls `https://nasstatus.faa.gov/api/airport-events` three ways (no headers, AeroBrief headers, browser-like User-Agent) and returns the status, blocker-identifying response headers and the first 300 characters of each body. See `.kiro/specs/faa-403-poller/`.

It has no bindings, secrets or cron, and no workflow deploys it. Use it only briefly and do not share its `workers.dev` URL.

`tools/faa-probe` is not a workspace and has no local wrangler, so `npx wrangler` does not work from there. Run wrangler from `apps/poller` and point it at the probe config.

Behind local HTTPS inspection, set this first in the same PowerShell session (an expired token could not be refreshed otherwise). Never disable TLS verification.

```
$env:NODE_OPTIONS = "--use-system-ca"
```

## Deploy (needs owner approval)

From `apps/poller`:

```
npx wrangler deploy --config ..\..\tools\faa-probe\wrangler.jsonc
```

Open the printed `workers.dev` URL with GET and save the JSON.

## Delete (needs owner approval)

From `apps/poller`:

```
npx wrangler delete --name aerobrief-faa-probe
```
