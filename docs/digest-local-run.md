# Digest cron: local run (task 5.22)

Goal: run the poller's hourly digest locally against the Neon `phase-2` branch. One email reaches the owner address. A second trigger sends nothing. The test user `digest-skip-test@example.invalid` is skipped with `not_allowlisted`.

Branch: confirm `git branch --show-current` prints `phase-2`. Never point `.dev.vars` at the production branch.

## What is seeded (phase-2 branch only)

| User | Watchlist | Preference |
| --- | --- | --- |
| <owner-email> | ATL | enabled, hour 4 UTC |
| digest-skip-test@example.invalid | ATL | enabled, hour 4 UTC |
| delivered@resend.dev | none | none (never selected) |

Preferences have `updated_at` one day in the past.

## Trigger window

The seeded hour is 4 UTC. The digest is due from **04:00:00 UTC to 07:59:59 UTC on 2026-11-19** (the hour plus 3 catch-up hours). Outside that window nothing is due. To use a later hour, run `packages/db/seed/phase2-digest-test.sql` in the Neon console on the `phase-2` branch with `:hour` replaced by the current UTC hour. Check the UTC time with `(Get-Date).ToUniversalTime()`.

## Selection rules (from the code)

A user is sent a digest only when all of these hold (`packages/core/src/digest/due.ts`, `packages/db/src/digest.ts`):

- `digest_preferences.enabled = true`.
- `digest_preferences.hour` equals the UTC hour of one of the 4 whole hours ending at the trigger time.
- `digest_preferences.updated_at` is not after that scheduled hour.
- The user has at least one `subscriptions` row.
- No `digest_deliveries` row exists for that user and UTC date.

The latest snapshot and events do not select users. With no snapshot the email says the status is unknown; a stale snapshot only adds a notice.

## 1. Create apps/poller/.dev.vars

`.dev.vars` is gitignored (`.gitignore` line 5; `git check-ignore -v apps/poller/.dev.vars` confirms it). Never commit it.

```powershell
Copy-Item apps/poller/.dev.vars.example apps/poller/.dev.vars
notepad apps/poller/.dev.vars
```

Set these keys:

| Key | Value | Source |
| --- | --- | --- |
| `DATABASE_URL` | the `phase-2` branch connection string, RUNTIME role | Neon console, branch `phase-2`, Connect, runtime role |
| `RESEND_API_KEY` | `re_...` | Resend dashboard |
| `UNSUBSCRIBE_SECRET` | any test string of 32+ characters | You choose. On the branch, links only need to verify against the branch API, so it need not match production |
| `FRONTEND_URL` | `http://localhost:5173` | Local, used for links in the email |
| `MAIL_FROM` | `AeroBrief <alerts@aerobriefs.com>` | A sender verified in Resend |
| `FEATURE_DIGESTS` | `true` | Only the exact value `true` turns the flag on |
| `SAFE_SEND_MODE` | `true` | Keeps the allowlist active |
| `SAFE_SEND_ALLOWLIST_EMAILS` | the owner address | Your own address only |

Leave the other flags as `false`. `parseEnv` requires `DATABASE_URL`, `RESEND_API_KEY`, `UNSUBSCRIBE_SECRET`, `FRONTEND_URL` and `MAIL_FROM`; the flag and Safe_Send keys are optional but needed for this test.

## 2. Start the dev server

```powershell
cd apps/poller
npx wrangler dev --test-scheduled
```

Wait for `Ready on http://localhost:8787`. The poll and cleanup crons are not triggered by the dev server; only your request runs a cron.

## 3. Trigger the digest cron (inside the window)

In a second PowerShell window:

```powershell
curl.exe "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
```

`+` encodes a space, so the value is `0 * * * *`, which equals `DIGEST_CRON` in `apps/poller/src/crons.ts`. Any other string falls to the "unknown cron trigger" branch and does nothing. Cloudflare documents the same encoding (`cron=*+*+*+*+*`) in the [Python Workers cron changelog](https://developers.cloudflare.com/changelog/post/2025-04-22-python-worker-cron-triggers/) and the [scheduled handler docs](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled), which also list `/cdn-cgi/local/scheduled` as the newer path. If `/__scheduled` returns 404 on your wrangler version, use `http://localhost:8787/cdn-cgi/local/scheduled?cron=0+*+*+*+*`.

## 4. Expected result

- One email arrives at the owner address.
- The wrangler log shows `digest_outcome` with `status: handed_off` for one user and `status: skipped` for the other.

Check in the Neon console (branch `phase-2`, read-only):

```sql
SELECT u.email, d.digest_date, d.status, d.attempts, d.skip_reason
FROM digest_deliveries d JOIN users u ON u.id = d.user_id
WHERE lower(u.email) IN ('<owner-email>', 'digest-skip-test@example.invalid')
ORDER BY u.email;
```

Expected: two rows.

| email | status | attempts | skip_reason |
| --- | --- | --- | --- |
| digest-skip-test@example.invalid | skipped | 0 | not_allowlisted |
| <owner-email> | handed_off | 1 | null |

## 5. Trigger a second time

Run the same `curl.exe` again. Expected: no new email, still the same two rows (a claim exists for each user and date, so neither is due). Re-run the SQL above to confirm.

## TLS inspection caveat

`workerd` does not use `NODE_OPTIONS` or the Windows certificate store settings that Node uses. On a network with HTTPS inspection (a corporate proxy), the Neon or Resend fetches can fail with certificate errors (for example `unable to get local issuer certificate` or `self-signed certificate in certificate chain`). In the digest this appears as `digest_run_failed` or a `failed` delivery with no email. Run the test from a network without HTTPS inspection. Do not disable TLS verification.

## Troubleshooting
### Certificate errors under HTTPS inspection
`workerd` ignores `NODE_OPTIONS=--use-system-ca`, so on a network that re-signs HTTPS traffic the Neon and Resend fetches fail with certificate errors. Point `NODE_EXTRA_CA_CERTS` at the inspecting root CA. Never disable TLS verification; that is not an acceptable workaround.

Export the root certificate once. The snippet connects to Neon, builds the certificate chain the proxy presents, and writes the last (root) certificate to `$env:USERPROFILE\proxy-root.pem`:
```powershell
$hostName = "ep-billowing-union-bbe8q751.c-15.us-east-1.aws.neon.tech"
$tcp = [System.Net.Sockets.TcpClient]::new($hostName, 443)
$ssl = [System.Net.Security.SslStream]::new($tcp.GetStream(), $false, { $true })
$ssl.AuthenticateAsClient($hostName)
$chain = [System.Security.Cryptography.X509Certificates.X509Chain]::new()
$chain.Build([System.Security.Cryptography.X509Certificates.X509Certificate2]::new($ssl.RemoteCertificate)) | Out-Null
$root = $chain.ChainElements[$chain.ChainElements.Count - 1].Certificate
$b64 = [Convert]::ToBase64String($root.RawData, "InsertLineBreaks")
"-----BEGIN CERTIFICATE-----`n$b64`n-----END CERTIFICATE-----" | Set-Content "$env:USERPROFILE\proxy-root.pem" -Encoding ascii
$ssl.Dispose(); $tcp.Dispose()
```
The callback `{ $true }` only lets the handshake finish so the chain can be read. It is used for this one export and never for sending data. Check that the subject of the exported root is your organisation's inspection CA, not a public CA.

Then start the dev server with the variable set:
```powershell
cd apps/poller
$env:NODE_EXTRA_CA_CERTS = "$env:USERPROFILE\proxy-root.pem"; npx wrangler dev --test-scheduled
```

### `relation "digest_preferences" does not exist`
`DATABASE_URL` in `.dev.vars` points at a database without migration 0005 (production has neither 0004 nor 0005). It must be the `phase-2` branch runtime-role string, host `ep-billowing-union-bbe8q751...`. Print only the host, never the whole string:
```powershell
(Select-String -Path apps\poller\.dev.vars -Pattern '^DATABASE_URL=').Line -replace '^DATABASE_URL=', '' -replace '"', '' | ForEach-Object { ([uri]$_).Host }
```
## Cleanup

```powershell
Remove-Item apps/poller/.dev.vars
```

Stop the dev server (Ctrl+C). To allow a second test day, run the cleanup statements at the bottom of `packages/db/seed/phase2-digest-test.sql` in the Neon console on the `phase-2` branch only. Then record the result in `docs/decisions.md`.
