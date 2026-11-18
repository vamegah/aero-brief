# AeroBrief production runbook (Tasks 13.2 to 13.5)

You run every step in this document. Nothing here is automated. Never paste secret values into chat, commits, issues or screenshots. When a command asks for a value, take it from the provider console or your password manager.

To rotate production secrets after a leak or on a schedule, see [`docs/secret-rotation.md`](secret-rotation.md).

Placeholders used below: `<API_WORKER_URL>` is the API Worker URL printed by `wrangler deploy` (for example `https://aerobrief-api.<subdomain>.workers.dev`). `<WEB_URL>` is the production Vercel URL, with no trailing slash and no path (for example `https://aerobrief.vercel.app` or your custom domain).

## 0. Read first: repo issues to fix before deploying

| # | Where | Problem | Fix |
|---|---|---|---|
| 1 | `apps/web/vercel.json` line 3 | `/api/*` rewrite points at `https://aerobrief-api.<your-subdomain>.workers.dev`. | Section 13.2 step 6. |
| 2 | `apps/api/wrangler.jsonc` and `apps/poller/wrangler.jsonc`, `vars` | `MAIL_FROM` is set to `AeroBrief <alerts@aerobriefs.com>` (verified in task 13.4). Confirm `FRONTEND_URL` is also real. | Section 13.2 step 4 and section 13.4. |
| 3 | `.env.example` | It contains what look like real Neon connection strings (host and role password) for `DATABASE_URL`, `TEST_DATABASE_URL` and `DATABASE_URL_UNPOOLED`. The file is not gitignored and the repo has no commits yet. | Before the first commit, replace them with placeholders. Treat that password as exposed to anyone who saw the file and rotate it in the Neon console (Roles, Reset password). |
| 4 | `.env.example` | `DATABASE_URL_UNPOOLED` is described as "used by Drizzle Kit only", but `packages/db/drizzle.config.ts` reads only `DATABASE_URL` and does not load any `.env` file. | Section 13.2 step 1 sets `DATABASE_URL` in the shell to the unpooled owner URL for the migration command only. |
| 5 | `.env.example` | `FRONTEND_URL` and `MAIL_FROM` are listed next to the secrets, but the Workers get them from `vars` in `wrangler.jsonc`. Setting the same name as a secret as well causes a binding conflict on deploy. | Set them only in `wrangler.jsonc` (step 4). Do not run `secret put` for them. |
| 6 | `apps/web/README.md` | The API accepts mutating requests only when `Origin` equals the origin of `FRONTEND_URL` (`apps/api/src/router.ts` line 221). A wrong or `www`-mismatched `FRONTEND_URL` makes every sign-in and watchlist write fail with 403. | `FRONTEND_URL` must equal `<WEB_URL>` exactly. |

`MAIL_FROM` is not hardcoded in any source file. `apps/poller/src/poll.ts` and `apps/api/src/handlers/auth.ts` both read `env.MAIL_FROM`, and a grep of `apps/*/src` and `packages/*/src` for `onboarding@resend.dev` finds nothing. Only test fixtures use `example.com`.

Secret variable inventory from `.env.example`:

| Variable | Worker secret? | Where it goes |
|---|---|---|
| `DATABASE_URL` | Yes, both Workers | Use the `aerobrief_runtime` role URL (pooled host), not the owner URL. |
| `RESEND_API_KEY` | Yes, both Workers | Prefer a key restricted to "Sending access" for your domain. |
| `UNSUBSCRIBE_SECRET` | Yes, both Workers | Must be identical in both Workers, or unsubscribe links from the poller will fail verification in the API. |
| `FRONTEND_URL` | No, `vars` | Edit both `wrangler.jsonc` files. |
| `MAIL_FROM` | No, `vars` | Edit both `wrangler.jsonc` files. |
| `DATABASE_URL_UNPOOLED` | No | Local shell only, for migrations. |
| `RUNTIME_DATABASE_URL` | No | Only a note: its value is what you store as the Workers' `DATABASE_URL` secret. |
| `TEST_DATABASE_URL` | No | Tests only. Never deploy it. Never point it at production. |

Both Workers validate their env with Zod on use (`apps/*/src/env.ts`). A missing or malformed value produces an error naming only the variable, never the value.

---

## 13.2 Deploy poller and API to Cloudflare, web to Vercel, set secrets

Prerequisites: `npm install` has run at the repo root, `npx wrangler login` is done, `npx vercel login` is done (or use the Vercel dashboard), and `npm test` and `npm run typecheck` pass on the commit you are deploying.

### Step 1. Apply Drizzle migrations to the production Neon database

Use the direct (unpooled) owner connection for DDL. The four migrations are `0000_init_schema.sql`, `0001_enforce_subscription_cap.sql`, `0002_seed_airports.sql` and `0003_poller_lease_holder.sql`.

In PowerShell, from the repo root:

```powershell
$env:DATABASE_URL = "<paste the UNPOOLED owner URL from the Neon console>"
npx drizzle-kit migrate --config packages/db/drizzle.config.ts
Remove-Item Env:DATABASE_URL
```

Type the value only in your own terminal and do not echo it. The last line clears it. The URL for this step is the owner role's direct (non-pooler) URL, which is `DATABASE_URL_UNPOOLED` in `.env.example`.

Verify in the Neon SQL editor:

```sql
select count(*) from drizzle.__drizzle_migrations;   -- expect 4
select count(*) from airports;                       -- expect 20
select count(*) from poller_lease;                   -- expect 1
```

### Step 2. Create the least-privilege runtime role

Migration `0002_seed_airports.sql` documents the grants but does not run them. Create the role in the Neon console (Roles, New role, name `aerobrief_runtime`) so you get a password, then run in the SQL editor as the owner:

```sql
GRANT USAGE ON SCHEMA public TO aerobrief_runtime;
GRANT SELECT ON "airports" TO aerobrief_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON "snapshots", "events", "subscriptions", "alert_log",
  "users", "sessions", "magic_links", "job_runs", "poller_lease" TO aerobrief_runtime;
```

Copy the pooled connection string for that role. This is the value for the Workers' `DATABASE_URL` secret. It must not have write access to `airports`.

### Step 3. Generate the unsubscribe secret

Generate a long random value locally without printing it to a shared log, for example:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Store it in your password manager. You will paste it twice (once per Worker).

### Step 4. Set non-secret vars in both `wrangler.jsonc` files

Edit `vars` in `apps/poller/wrangler.jsonc` and `apps/api/wrangler.jsonc`:

- `FRONTEND_URL`: `<WEB_URL>` (exact origin, no trailing slash).
- `MAIL_FROM`: `AeroBrief <alerts@YOUR-VERIFIED-DOMAIN>`. The domain must be the one you verify in section 13.4.

If you do not yet know `<WEB_URL>`, deploy the web app first (step 7), then come back and redeploy both Workers. Commit these edits.

### Step 5. Deploy the two Workers and set secrets

Run each command from the named directory. `wrangler secret put` prompts for the value and does not echo it.

API Worker:

```powershell
cd apps/api
npx wrangler deploy
npx wrangler secret put DATABASE_URL
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put UNSUBSCRIBE_SECRET
cd ../..
```

Poller Worker:

```powershell
cd apps/poller
npx wrangler deploy
npx wrangler secret put DATABASE_URL
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put UNSUBSCRIBE_SECRET
cd ../..
```

Notes:
- Record the `<API_WORKER_URL>` that `wrangler deploy` prints for `aerobrief-api`.
- The poller has no HTTP route. Its two crons (`*/5 * * * *` poll, `*/30 * * * *` cleanup) are registered by the deploy. Confirm both appear in the Cloudflare dashboard under Workers, `aerobrief-poller`, Settings, Triggers.
- `DATABASE_URL`, `RESEND_API_KEY` and `UNSUBSCRIBE_SECRET` must be set on both Workers.

Verify the secret names (values are never shown):

```powershell
cd apps/api; npx wrangler secret list; cd ../..
cd apps/poller; npx wrangler secret list; cd ../..
```

### Step 6. Point `vercel.json` at the real API Worker

In `apps/web/vercel.json`, change the first rewrite's `destination`:

```
"destination": "https://aerobrief-api.<your-subdomain>.workers.dev/api/:path*"
```

to `"<API_WORKER_URL>/api/:path*"`. Replace the whole placeholder host, including the angle brackets. Commit the change.

Check the API Worker answers directly:

```powershell
curl.exe -i <API_WORKER_URL>/api/health
```

Expect HTTP 200 and `{"status":"ok"}`.

### Step 7. Deploy the web app to Vercel

The web app reads no Vercel environment variables. `apps/web` has no `import.meta.env` or `VITE_*` usage, and the browser only calls same-origin `/api/*`, which Vercel rewrites to the Worker. So no Vercel env vars are required. If you add any later, set them with `npx vercel env add <NAME> production`.

Project settings (Vercel dashboard, Import Project):
- Root Directory: `apps/web`.
- Framework preset: Vite. Build command `npm run build`. Output directory `dist`.
- Install command: leave the default, but keep "Include source files outside of the Root Directory" enabled, because `apps/web` lives in an npm workspaces monorepo.

Deploy by pushing to the connected branch, or from `apps/web` with `npx vercel --prod`.

Then confirm the rewrite works through Vercel:

```powershell
curl.exe -i <WEB_URL>/api/health
```

Expect HTTP 200 and `{"status":"ok"}`. If you changed `FRONTEND_URL` after learning `<WEB_URL>`, redeploy both Workers now (step 5, `wrangler deploy` only).

### 13.2 verification checklist

- [ ] Migrations applied: `drizzle.__drizzle_migrations` has 4 rows, `airports` has 20 rows, `poller_lease` has 1 row.
- [ ] `aerobrief_runtime` role exists with the grants above and has no write access to `airports`.
- [ ] `apps/api/wrangler.jsonc` and `apps/poller/wrangler.jsonc` have the real `FRONTEND_URL` (equal to `<WEB_URL>`) and a real `MAIL_FROM`, committed.
- [ ] `wrangler secret list` shows `DATABASE_URL`, `RESEND_API_KEY`, `UNSUBSCRIBE_SECRET` on both Workers.
- [ ] `UNSUBSCRIBE_SECRET` is identical in both Workers.
- [ ] Workers' `DATABASE_URL` is the runtime role URL, not the owner URL.
- [ ] `aerobrief-poller` shows both cron triggers in the Cloudflare dashboard.
- [ ] `apps/web/vercel.json` rewrite points at `<API_WORKER_URL>` with no `<your-subdomain>` left.
- [ ] `curl <API_WORKER_URL>/api/health` and `curl <WEB_URL>/api/health` both return 200.
- [ ] Web is deployed and `<WEB_URL>` loads in a browser.
- [ ] `.env.example` contains placeholders only, and the exposed Neon password was rotated (section 0, item 3).

---

## 13.3 Live smoke test

Goal: one cron cycle, one snapshot in the database and UI, one real email delivered.

### Step 1. Trigger one poll cycle

Preferred: let the deployed cron run. It fires at the next minute divisible by 5 (UTC). Watch it live:

```powershell
cd apps/poller
npx wrangler tail
```

Wait for the next `:00`, `:05`, `:10` and so on, then stop the tail with Ctrl+C. Logs never contain secret values.

Alternative (local, uses real production data): `apps/poller/package.json` has `dev` as `wrangler dev --test-scheduled`. This needs `apps/poller/.dev.vars` (gitignored, copy from `.dev.vars.example`) holding the production `DATABASE_URL`, `RESEND_API_KEY` and `UNSUBSCRIBE_SECRET`. A local run writes to the production database and can send real email. Use it only if you accept that.

```powershell
cd apps/poller
npm run dev
# in a second terminal:
curl.exe "http://localhost:8787/__scheduled?cron=*%2F5+*+*+*+*"
```

The cron string must match `*/5 * * * *` exactly, or the dispatcher logs `unknown cron trigger` and does nothing. You can also use the Cloudflare dashboard Schedule test for the deployed Worker if your account shows it, but the tail method is simpler.

### Step 2. Confirm the database rows

Run in the Neon SQL editor:

```sql
-- One new snapshot with 20 airports, captured within the last 5 minutes
select id, captured_at, jsonb_array_length(airports) as airport_count
from snapshots order by captured_at desc limit 3;

-- A successful poll run pointing at that snapshot
select job, outcome, failure_kind, detail, started_at, finished_at, snapshot_id
from job_runs where job = 'poll' order by started_at desc limit 3;
```

Expect: `airport_count = 20`, newest `outcome = 'success'` with `failure_kind` and `detail` null, and `snapshot_id` equal to the newest snapshot `id`. After one cycle on an empty database, exactly one snapshot and one poll success row exist. If you waited through several ticks, expect one pair per tick.

If the newest row is `outcome = 'failed'`, read `failure_kind` (`timeout`, `http_status`, `unparseable`, `validation`, `storage`) and `detail`, then fix before continuing. On an empty database the first poll treats every active ground stop as started, which is expected.

### Step 3. Confirm the UI

Open `<WEB_URL>`.

- The airport table has 20 rows (count them, or run the browser console snippet `document.querySelectorAll("tbody tr").length`).
- The page shows the capture time and it matches `captured_at` from the SQL above, as `YYYY-MM-DD HH:mm UTC`.
- No stale-data banner appears while the latest snapshot is at most 10 minutes old.
- Cross-check the API: `curl.exe <WEB_URL>/api/status/national` returns `"state":"ok"`, `"stale":false` and 20 entries in `airports`.

### Step 4. Sign in with a magic link and add a watched airport

1. Open `<WEB_URL>/sign-in`, enter an email address you control, submit.
2. Open the email from your `MAIL_FROM` address. The link goes to `<WEB_URL>/auth/callback#token=...`. It expires in 15 minutes and works once.
3. Click it. You land signed in. The session cookie is 30 days, `HttpOnly; Secure; SameSite=Lax`.
4. Open `<WEB_URL>/watchlist` and add one airport. Confirm it shows "Watching".

Confirm in SQL:

```sql
select u.email, s.airport_id, s.added_at
from subscriptions s join users u on u.id = s.user_id
order by s.added_at desc limit 5;
```

If the email never arrives, check `magic_links` for a row with `invalidated_at` set (a Resend failure invalidates the link), then the Resend dashboard (Emails) and `wrangler tail` on the API Worker. Common causes: unverified domain (section 13.4), `MAIL_FROM` not on the verified domain, wrong `RESEND_API_KEY`.

If sign-in returns 403, `FRONTEND_URL` does not equal the browser origin (section 0, item 6).

### Step 5. Confirm one real alert email is delivered

Alerts are sent only on a change: a ground stop starting or ending at a watched airport, or a nationwide event for any user who watches at least one airport. A first poll never emails anyone who signed up afterwards, so pick one of these paths.

Path A (real event, no data changes). Watch an airport and wait until the FAA reports a ground stop starting or ending there. Nothing to do except wait. This may take hours or days.

Path B (controlled test, uses the normal pipeline, no new feature). This produces a `GROUND_STOP_ENDED` alert for a watched airport. It writes one synthetic ground stop into the newest production snapshot, so the UI will briefly show a fake ground stop (up to 5 minutes) and one fake ended event is stored for 24 hours. Do it only if you accept that.

Preconditions: you are signed in and watching airport `ATL` (substitute your watched airport everywhere), and the latest snapshot shows no ground stop at `ATL` (`groundStop` null in `airports`). If the real FAA feed shows a ground stop there, pick another airport.

1. Right after a poll tick finishes, run in the Neon SQL editor, as the owner:

```sql
update snapshots
set airports = (
  select jsonb_agg(
    case when a->>'airportId' = 'ATL'
      then jsonb_build_object(
        'airportId', 'ATL',
        'groundStop', jsonb_build_object(
          'faaEventId', 'faa:smoke-test-1',
          'idSource', 'faa_id',
          'reason', 'Smoke test',
          'center', 'ZTL',
          'endTime', null::text))
      else a end
    order by ord)
  from jsonb_array_elements(airports) with ordinality as t(a, ord)
)
where id = (select id from snapshots order by captured_at desc limit 1);
```

2. At the next tick (up to 5 minutes), the poller compares the live feed (no stop at ATL) to that edited snapshot and detects `GROUND_STOP_ENDED` for `faa:smoke-test-1`. The Notifier sends one email to every user watching ATL.
3. The staleness gate blocks sending when the latest stored snapshot is more than 10 minutes old. The new snapshot from the next tick is fresh, so this only matters if polls are failing. Check `job_runs` if no email arrives.

Confirm delivery:

```sql
select e.type, e.airport_id, e.event_key, e.explanation
from events e order by e.occurred_at desc limit 3;

select status, attempts, latency_ms, error, completed_at
from alert_log order by created_at desc limit 3;
```

Expect `status = 'handed_off'`, `attempts` of 1 to 3, a `latency_ms` value, and `error` null. `handed_off` means Resend accepted the message. Then confirm real delivery in two places: the email arrives in your inbox with the airport name, the event type, the plain-language explanation, a `YYYY-MM-DD HH:mm UTC` time and an unsubscribe link, and the Resend dashboard (Emails) lists it as Delivered.

Click the unsubscribe link and confirm the page names the airport and `subscriptions` no longer has that row. This verifies `UNSUBSCRIBE_SECRET` matches across the two Workers.

Cleanup after Path B: the fake event and its `alert_log` row age out through the 30-minute cleanup cron (events after 24 hours, `alert_log` after 48 hours). To remove them sooner, delete the rows whose `event_key = 'faa:smoke-test-1'` from `alert_log` and `events` as the owner.

### 13.3 verification checklist

- [ ] One poll cycle ran (via `wrangler tail` or `--test-scheduled`) with no error logged.
- [ ] `snapshots` has a new row with `airport_count = 20` and `captured_at` within the last 5 minutes.
- [ ] `job_runs` has a `poll` row with `outcome = 'success'` whose `snapshot_id` matches that snapshot.
- [ ] `<WEB_URL>` shows 20 airport rows and a capture time equal to the database `captured_at`.
- [ ] `<WEB_URL>/api/status/national` returns `state: ok`, `stale: false`.
- [ ] Magic-link email arrived from the production `MAIL_FROM` address, the link signed you in, and a watchlist add persisted in `subscriptions`.
- [ ] One alert email arrived in the inbox, `alert_log.status = 'handed_off'`, and Resend shows it as Delivered.
- [ ] The alert's unsubscribe link worked.
- [ ] If Path B was used, the synthetic rows were removed or you accept them aging out.

---

## 13.4 Verify the Resend production domain

### Step 1. Add and verify the sending domain

1. In Resend, open Domains, Add Domain. Use a domain or subdomain you control (a subdomain such as `mail.yourdomain.com` keeps it separate from other mail).
2. Resend shows the DNS records to create. Add them at your DNS host exactly as shown:
   - An SPF record: a TXT record on the `send` subdomain of the domain (Resend shows the exact host and value), plus the matching MX record for the same host.
   - A DKIM record: a TXT record at `resend._domainkey` for the domain (value is a long public key).
   - Optional but recommended: a DMARC TXT record at `_dmarc`, for example `v=DMARC1; p=none; rua=mailto:you@yourdomain.com`.
3. Back in Resend, click Verify. Wait until the domain status is Verified. DNS can take minutes to hours. Resend lists each record as Verified individually.

Check from your machine (replace the domain):

```powershell
nslookup -type=TXT resend._domainkey.yourdomain.com
nslookup -type=TXT send.yourdomain.com
```

### Step 2. Confirm the From address is on that domain

The sender is not hardcoded in source. It comes from `MAIL_FROM` through `apps/poller/src/poll.ts` and `apps/api/src/handlers/auth.ts`. A repo-wide search of `apps/*/src` and `packages/*/src` for `onboarding@resend.dev` finds no match. The only addresses to fix are the `wrangler.jsonc` placeholders.

Check both files by running:

```powershell
Select-String -Path apps/api/wrangler.jsonc,apps/poller/wrangler.jsonc -Pattern "MAIL_FROM|example\.com|resend\.dev"
```

Expect `MAIL_FROM` lines on your verified domain, and no `example.com` or `resend.dev` matches.

The address in `MAIL_FROM` must use the verified domain (or a subdomain under it, as Resend allows). Redeploy both Workers after changing `vars` (`npx wrangler deploy` in each app directory).

Prove it end to end: the magic-link email from 13.3 step 4 shows the verified-domain address in the From header, and its message headers in your mail client show `spf=pass` and `dkim=pass`.

### 13.4 verification checklist

- [ ] Resend Domains shows the sending domain as Verified, with SPF and DKIM both Verified.
- [ ] DNS records were created at the DNS host and resolve with `nslookup`.
- [ ] DMARC record added (recommended).
- [ ] `MAIL_FROM` in `apps/api/wrangler.jsonc` and `apps/poller/wrangler.jsonc` is on the verified domain, not `example.com` and not `onboarding@resend.dev`.
- [ ] Both Workers were redeployed after the `MAIL_FROM` change.
- [ ] A received email shows the production From address and `spf=pass`, `dkim=pass`.
- [ ] The `RESEND_API_KEY` secret is a sending-access key scoped to this domain, not a full-access key (recommended).

---

## 13.5 Uptime monitor on `GET /api/health`

Approved deviation: an external monitor is outside the fixed stack. The approval, reason and in-stack alternative are in `docs/decisions.md` under "2026-11-16: External uptime monitor (Task 13.5)". Nothing is added to the repo. Account creation and monitor setup are done by you in the provider dashboard.

### What `/api/health` does (checked against production on 2026-11-17)

- `GET https://www.aerobriefs.com/api/health` and `GET https://aerobrief-api.vamegah.workers.dev/api/health` both return `200` with body `{"status":"ok"}` (15 bytes).
- The handler (`apps/api/src/handlers/status.ts`) returns a constant. It makes no database call and reads no env, so it is cheap and exposes no secrets.
- Unhealthy cases: if the Worker is down or errors, the monitor sees a 5xx or a timeout. If the Worker env is invalid, the router returns 500 before the handler runs. If the Vercel rewrite breaks, only the `www` URL fails. That is why you monitor both URLs.
- It does not check the database or the poller. A dead cron leaves it green. Cover that with the optional freshness monitor below.

### Recommended: UptimeRobot free plan

Chosen because the free tier gives 5-minute checks, keyword checks and email alerts with no credit card. Better Stack is an acceptable alternative (free tier checks every 3 minutes). Check the current plan page, since limits change.

Create two monitors:

| Name | Type | URL | Interval | Check |
|---|---|---|---|---|
| AeroBrief web health | Keyword | `https://www.aerobriefs.com/api/health` | 5 minutes | Alert when keyword `"status":"ok"` does not exist. Case sensitive. HTTP 200 required. |
| AeroBrief API (workers.dev) health | Keyword | `https://aerobrief-api.vamegah.workers.dev/api/health` | 5 minutes | Same as above. |

Steps for each monitor:

1. Sign up at uptimerobot.com and confirm your email.
2. Dashboard, Add New Monitor, Monitor Type: Keyword.
3. Fill in the name and URL from the table. Method GET. Keyword `"status":"ok"`. Alert when: keyword does not exist.
4. Monitoring interval: 5 minutes.
5. Alert contacts: tick your email address (My Settings, Alert Contacts, Add, then click the confirmation link in the verification email).
6. Create Monitor. It should show Up within a few minutes.

If the free plan only offers a plain HTTP(s) monitor in your region, use HTTP(s). It alerts on any non-2xx/3xx status or timeout, and you lose only the body check.

### Better Stack equivalent

Uptime, Monitors, Create monitor. Alert us when: URL does not contain keyword `"status":"ok"`. Request GET, check frequency at the smallest available (3 minutes on free), on-call contact is your email. Repeat for the second URL.

### Optional: poller freshness

Add a third monitor, Keyword, on `https://www.aerobriefs.com/api/status/national`, keyword `"stale":true`, alert when the keyword exists. The API sets `stale: true` when the latest snapshot is older than 10 minutes. This is the only check that notices a stopped poller. It reads one snapshot from the database per check, so keep the interval at 5 minutes.

### Verify an alert fires

1. After the monitors show Up, edit the web monitor and change the keyword to `"status":"down"`. Save. This makes the check fail while the site is healthy.
2. Within one interval (up to 5 minutes, plus a retry), a Down alert email should arrive at the confirmed address. Check spam.
3. Change the keyword back to `"status":"ok"`. Within one interval an Up (recovery) email arrives.
4. Alternatively, use the provider's "send test notification" option on the alert contact.

### 13.5 verification checklist

- [ ] UptimeRobot (or Better Stack) account created and email confirmed.
- [ ] Monitor on `https://www.aerobriefs.com/api/health`, keyword `"status":"ok"`, 5-minute interval, shows Up.
- [ ] Monitor on `https://aerobrief-api.vamegah.workers.dev/api/health`, same settings, shows Up.
- [ ] Alert contact email confirmed.
- [ ] Forced-failure test sent a Down email and a recovery email.
- [ ] Monitors stayed Up for at least 10 minutes after restoring the keyword.
- [ ] Interval actually used is recorded in `docs/decisions.md`.
- [ ] (Optional) `"stale":true` monitor on `/api/status/national`.
