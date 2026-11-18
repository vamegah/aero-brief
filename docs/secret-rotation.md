# Secret rotation runbook

`npm run rotate-secrets` rotates three production secrets from your machine: the Neon role password (`DATABASE_URL`), the Resend runtime API key (`RESEND_API_KEY`), and `UNSUBSCRIBE_SECRET`. It sets the new values on the API and Poller Workers, rewrites your local `.env`, and prints a report that never contains secret values. This covers Requirement 16.

Never paste secret values into chat, commits, issues or screenshots.

## 1. One-time setup

The script reads everything from the local `.env` at the repo root (or the file given with `--env-path`). Names and placeholders are in `.env.example`.

| Variable | Where to get it |
|---|---|
| `NEON_API_KEY` | Neon console, Account settings, API keys. Create a key for this purpose. |
| `NEON_PROJECT_ID`, `NEON_BRANCH_ID` | Neon console (project Settings, and the Branches page), or `neonctl projects list` and `neonctl branches list --project-id <id>`. |
| `NEON_ROLE_NAME` | The role in the Workers' connection string, for example `aerobrief_runtime`. Neon console, Roles, or `neonctl roles list`. |
| `RESEND_ADMIN_API_KEY` | Resend dashboard, API Keys, create a key with **Full access**. |
| `RESEND_API_KEY_ID` | Resend dashboard, API Keys, the **id** of the key the Workers use now. This is the id, not the `re_...` token. |
| `RESEND_DOMAIN_ID` (optional) | Resend dashboard, Domains. If unset, the script looks the domain up by name. |
| `RESEND_DOMAIN_NAME` (optional) | Defaults to `aerobriefs.com`. Used only for the lookup when `RESEND_DOMAIN_ID` is unset. |

The script also uses these existing `.env` values: `FRONTEND_URL` (for the status check), `MAIL_FROM` (for the Resend test email), `UNSUBSCRIBE_SECRET`, and the connection strings `RUNTIME_DATABASE_URL` or `DATABASE_URL`. `NEON_ROLE_NAME` must match the user in `RUNTIME_DATABASE_URL` or `DATABASE_URL`. If neither matches, preflight fails, because the Workers' `DATABASE_URL` would not change. `RUNTIME_DATABASE_URL` is preferred when both match.

Cloudflare: sign in once with Wrangler.

```powershell
cd apps/api
npx wrangler login
```

The script runs `wrangler whoami` in `apps/api` during preflight and uses that session for both Workers.

**Keep the admin credentials local.** `NEON_API_KEY` and `RESEND_ADMIN_API_KEY` are high-privilege. They live only in your local `.env`. Never set them as Worker secrets, GitHub Actions secrets or Vercel variables. The runtime key stays sending-only, scoped to the sending domain.

## 2. Deploy-19.1-first rule

Rotating `UNSUBSCRIBE_SECRET` requires the API to be running code that accepts `UNSUBSCRIBE_SECRET_PREVIOUS` (task 19.1). If the old API is live when the secret changes, every unsubscribe link already emailed stops working.

Before rotating the unsubscribe secret:

1. Find the commit that contains task 19.1 (dual-secret unsubscribe verification).
2. Confirm the `deploy-workers` run for that commit, or a later one, finished successfully: GitHub, Actions, "Deploy Workers".
3. Optionally confirm the API Worker's latest deployment time in the Cloudflare dashboard is after that run.

Then pass `--confirm-api-deployed`. Without that flag the script asks you to type `yes` in an interactive terminal. In a non-interactive shell it refuses. Rotating only `neon` or `resend` does not need this.

## 3. Dry run, then the real run

Run from the repo root.

A dry run validates the `.env` variables for the selected steps and prints the planned steps. It makes no subprocess call, no network call and no file change. It still needs the `.env` file to exist and have the variables the selected steps need.

```powershell
# PowerShell
npm run rotate-secrets -- --dry-run
```

```bash
# bash
npm run rotate-secrets -- --dry-run
```

Real run, all three secrets:

```powershell
npm run rotate-secrets -- --confirm-api-deployed
```

Real run, one secret (`--only` takes any of `neon`, `resend`, `unsubscribe`, comma separated). Steps always run in the order Neon, Resend, unsubscribe:

```powershell
npm run rotate-secrets -- --only=resend
npm run rotate-secrets -- --only=neon,resend
npm run rotate-secrets -- --only=unsubscribe --confirm-api-deployed
```

```bash
npm run rotate-secrets -- --only=neon
```

Use another env file with `--env-path`:

```powershell
npm run rotate-secrets -- --dry-run --env-path C:\secure\aerobrief.env
```

What a real run does, in order:

1. **Preflight.** Validates inputs, checks the `--confirm-api-deployed` rule, runs `wrangler whoami`.
2. **Neon.** Resets the role password through the Neon API. The old password stops working immediately. The script replaces the password in every `.env` connection string that uses the role (`RUNTIME_DATABASE_URL`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `TEST_DATABASE_URL`), then runs `wrangler secret put DATABASE_URL` on the **api** and **poller** Workers. It then calls `GET <FRONTEND_URL>/api/status/national`. That must return 200 with state `ok` or `no_data`. It retries up to 10 times, 3 seconds apart, while the new secret propagates.
3. **Resend.** Looks up the domain (`RESEND_DOMAIN_ID`, otherwise by `RESEND_DOMAIN_NAME`), creates a sending-only key named `aerobrief-runtime-<date>` restricted to that domain, sets `RESEND_API_KEY` on **api** and **poller**, and sends one test email to `delivered@resend.dev` with the new key. Only after that succeeds does it delete the old key (by `RESEND_API_KEY_ID`) and record the new id.
4. **Unsubscribe secret.** Generates 32 random bytes. On **api** only, sets `UNSUBSCRIBE_SECRET_PREVIOUS` (the old value) and `UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT` (now plus 30 days), then `UNSUBSCRIBE_SECRET`. Then sets `UNSUBSCRIBE_SECRET` on **poller**. The Poller never gets the previous secret.
5. **Local file.** Copies `.env` to `.env.backup` (overwriting any earlier backup), then rewrites `.env` through a temp file and rename, changing only the affected lines.
6. **Report.** Outcome, completed steps, secrets changed, anything not rotated, secrets set per Worker, `.env` keys written, and follow-ups.

Secret values go to `wrangler` through stdin, never on the command line. The script exits with code 1 on any failure.

## 4. What to check afterwards

1. `curl.exe https://www.aerobriefs.com/api/status/national` returns 200 (the script checks this after the Neon step, but check again at the end).
2. Sign in on the live site with a magic link. This proves the new Resend key works on the API Worker.
3. Open an unsubscribe link from an email sent before the rotation. It must still work, until the expiry date printed in the report (30 days).
4. Both Workers list the expected secret names (names only, no values):

   ```powershell
   cd apps/api;    npx wrangler secret list
   cd ../poller;   npx wrangler secret list
   ```

   Expected after a full run: api has `DATABASE_URL`, `RESEND_API_KEY`, `UNSUBSCRIBE_SECRET`, `UNSUBSCRIBE_SECRET_PREVIOUS`, `UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT`. Poller has `DATABASE_URL`, `RESEND_API_KEY`, `UNSUBSCRIBE_SECRET`.
5. The report lists the keys written to `.env`. Check the file has no duplicated lines and `RESEND_API_KEY_ID` holds the new key's id.
6. In the Resend dashboard, only the new runtime key remains, next to your admin key.
7. Update any other copy of the rotated values: Neon connection strings in CI, Vercel or `.dev.vars` files.
8. Delete `.env.backup`, or move it to a password manager. It holds the previous secret values.

## 5. Recovery from a failed run

The script stops at the first failure. Read the report first. `Failed step` names the step, `Secrets changed` and `Worker api/poller updated` say what changed, and `Not rotated` lists targets that did not finish. Steps for later targets did not run.

**Copy `.env.backup` somewhere safe before you re-run.** Every run that writes `.env` overwrites `.env.backup`, so a second run replaces the backup from before the first.

State after each kind of failure:

| Failed step | State | What to do |
|---|---|---|
| `preflight`, or any failure before a change | Nothing changed. `.env` untouched. | Fix the named variable or login and run again. |
| `neon:reset-password` (request error) | If the request failed after being sent, the password may have changed. `.env` is untouched. | Check the app. If it fails, reset the password in the Neon console, put it into `.env` connection strings, and set `DATABASE_URL` on both Workers (below). |
| `neon:put-DATABASE_URL:api` or `:poller` | The Neon password is new. `.env` has the new connection strings. A Worker that was not updated still holds the old password and cannot reach the database. | Set `DATABASE_URL` on the Worker(s) that were not updated, using the `.env` value (below). Do not run `--only=neon` again; that resets the password a second time. |
| `neon:verify-status` | Password and Workers are updated. The status check did not pass in 10 tries. | Check `curl.exe <FRONTEND_URL>/api/status/national` and `wrangler tail`. If it is healthy, carry on with `--only=resend,unsubscribe`. |
| `resend:create-key` | Nothing changed. | Fix the cause (admin key, domain) and re-run `--only=resend`. |
| `resend:put-RESEND_API_KEY:api` or `:poller` | A new key `aerobrief-runtime-<date>` exists. The old key is still active and still deployed on at least one Worker. | Re-run `--only=resend`. It creates another new key and deletes the key whose id is in `.env`. Then delete the leftover `aerobrief-runtime-<date>` key from the failed run in the Resend dashboard. |
| `resend:verify-send` | The new key is on both Workers and in `.env`. The old key is not deleted and `RESEND_API_KEY_ID` still has the old id. | Find out why sending failed (domain status, `MAIL_FROM`). Then re-run `--only=resend`, then delete the leftover key in the dashboard. |
| `resend:delete-old-key` | The new key is verified, deployed and in `.env`, with its id. The old key is still active. | Delete the old key in the Resend dashboard (its id is `RESEND_API_KEY_ID` in `.env.backup`). Do not re-run, which would create yet another key. |
| `unsubscribe:put-...:api` before `UNSUBSCRIBE_SECRET` | The API may hold `UNSUBSCRIBE_SECRET_PREVIOUS` (and the expiry), but still signs with the old secret. `.env` is unchanged. | Re-run `--only=unsubscribe --confirm-api-deployed`. |
| `unsubscribe:put-UNSUBSCRIBE_SECRET:poller` | The API has the new secret, plus the previous one. `.env` has the new one. The Poller still signs with the old secret, which the API accepts until the expiry. | Set `UNSUBSCRIBE_SECRET` on the poller from `.env` (below). Do not re-run `--only=unsubscribe`: it would store the new secret as "previous" and drop the original one. |
| `local:write-env` | The Workers hold the new values, but the local `.env` was not updated. | Run the rotation again for the affected secret to get a fresh local copy. For Neon, get a new password with `--only=neon`. |

**Never delete the old Resend key until the new one is verified**: the new key has sent mail from both Workers, or at least passed the script's test email. The script follows this itself and never deletes the old key after a failure.

### Setting a Worker secret by hand

Put values through stdin or the hidden prompt, never as a command-line argument. Command-line values land in shell history and process lists.

Interactive (works in any shell). Run the command, then paste the value from your editor or password manager when asked:

```powershell
cd apps/poller
npx wrangler secret put UNSUBSCRIBE_SECRET
```

From `.env` through stdin, without the value appearing on screen:

```powershell
# PowerShell, from the repo root. Reads the first UNSUBSCRIBE_SECRET= line of .env.
cd apps/poller
(Get-Content ..\..\.env | Where-Object { $_ -like 'UNSUBSCRIBE_SECRET=*' } | Select-Object -First 1) -replace '^UNSUBSCRIBE_SECRET=','' | npx wrangler secret put UNSUBSCRIBE_SECRET
```

```bash
# bash, from the repo root
cd apps/poller
grep '^UNSUBSCRIBE_SECRET=' ../../.env | head -n1 | cut -d= -f2- | npx wrangler secret put UNSUBSCRIBE_SECRET
```

If a `.env` value is wrapped in quotes, use the prompt instead. For `DATABASE_URL`, read `RUNTIME_DATABASE_URL` (or `DATABASE_URL`, when it uses the Workers' role) from `.env` and put it as `DATABASE_URL` on each Worker that needs it. To restore a previous value, take it from `.env.backup` or your password manager the same way.

## 6. If a secret leaked

1. Rotate it now with this script. For a leak of the database password, run `--only=neon`; for the Resend key, `--only=resend`; for the unsubscribe secret, `--only=unsubscribe --confirm-api-deployed`. Run without `--only` if you are unsure what leaked.
2. Remember that the old unsubscribe secret stays valid on the API for 30 days after rotation. If the old unsubscribe secret was leaked, an attacker could still unsubscribe users with it during that window. To end the window sooner, delete `UNSUBSCRIBE_SECRET_PREVIOUS` from the API Worker (`npx wrangler secret delete UNSUBSCRIBE_SECRET_PREVIOUS` in `apps/api`). Links already emailed then stop working.
3. Rotate any copy outside this script: CI, Vercel, `.dev.vars` files, a password manager entry, shell history, and `.env.backup`.
4. The following values were exposed in this project's chat session, so rotate all three: the **Neon password**, the **Resend key** and the **`UNSUBSCRIBE_SECRET`**. Run the script with no `--only` after the API deploy check in section 2.
5. Check the Neon and Resend dashboards for activity you do not recognise.
6. Never commit `.env`, `.env.backup` or `.dev.vars`; they are gitignored. Check with `git status` before every commit.
