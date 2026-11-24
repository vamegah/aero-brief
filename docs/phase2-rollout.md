# Phase 2 production rollout plan

This plan covers how to turn on the four Phase 2 features in production: dark mode, high contrast, signed webhooks and the daily digest. It is a checklist for the project owner. No agent runs any step in it.

**The project owner decides when to enable anything and is the only one who pushes `main`.** Every step that touches production (a push, a Worker secret, a migration, a grant) needs the owner's approval first. Nothing here is urgent. With every flag off, the Phase 2 features do nothing, so the order and the timing of enabling them are the owner's choice. The Core 30 limits (migration `0006`, section 4a) are not a flag: they ship with the push of `main`, and `0006` must be applied to production first.

## 1. Facts this plan relies on

| Item | Value | Where it comes from |
| --- | --- | --- |
| Neon project | `bitter-fire-42970215` | `docs/decisions.md` |
| Production branch | `br-delicate-bar-bbqk6hwk` (named `production`) | `docs/decisions.md` |
| Phase 2 test branch | `br-odd-feather-bbpy60hl` (named `phase-2`) | `docs/decisions.md` |
| Runtime database role | `aerobrief_runtime` | `docs/decisions.md` |
| Contest MVP | tag `mvp-contest-2026`, commit `fff8374` | `git` |
| Migrations applied only to the `phase-2` Neon branch | `0004_webhooks`, `0005_digest` | `docs/decisions.md` |
| Migration for the Core 30 limits (no flag) | `0006_watchlist_cap_30`, applied to the `phase-2` Neon branch first, then to production before the push | `docs/decisions.md`, `docs/production-runbook.md` |

Not recorded anywhere in this repo: any connection string, password or secret value. This plan has none either. Never paste one into this file, a commit message or a chat.

## 2. What a push to `main` does

- `.github/workflows/deploy-workers.yml` runs on a push to `main` that changes `apps/api/**`, `apps/poller/**`, `packages/**` or the workflow file. It can also be started by hand (`workflow_dispatch`). The job has `if: github.ref == 'refs/heads/main'`, so no other branch deploys the production Workers. It deploys the API Worker, then the Poller Worker, with `cloudflare/wrangler-action@v3`.
- Vercel deploys the frontend from `main` on every push.
- At the time of writing, local `main` (at `bbd419e`) is ahead of `origin/main` (at `fff8374`). The local commits are the merged Phase 2 work with all flags off. Nothing has been pushed.
- With every flag unset or `false`, the deployed Phase 2 code behaves like the MVP (the 30 airports and the watchlist of 30 apply either way): `/api/features` answers the same 404 as any unknown path, the webhook and digest routes do the same, the Poller makes no webhook or digest query, and the pages look as before.
- **The push also registers a third cron trigger on the Poller (`0 * * * *`, the digest).** `apps/poller/wrangler.jsonc` now lists three crons (`*/5 * * * *` poll, `*/30 * * * *` cleanup, `0 * * * *` digest). Cloudflare limits cron triggers per account: 5 on the Free plan and 250 on the Paid plan (figures from the project brief; confirm on Cloudflare's current limits page). Before pushing, count the cron triggers already used by all Workers in the account. If the new one does not fit, the Poller deploy fails.
- After the deadline (December 4, 2026, 2:00 PM PT) `main` is frozen until judging has finished (`.kiro/steering/scope.md`). The Kiroween 2026 submission is `main` as of that deadline. The four features in this plan (dark mode, high contrast, daily digest, signed webhooks) can go to `main` one feature at a time, after their tests pass with the flag off and on. The rule that only these four may merge was removed on 2026-11-24 (`docs/decisions.md`); the other limits in `scope.md` still apply.

## 3. Where each setting lives

The frontend gets its flags from `GET /api/features`, which the API Worker answers (`apps/web/src/features/FeaturesProvider.tsx`). The frontend reads no flag from a build variable, the URL or local storage. So **enabling a feature is a Worker-side change only. No Vercel variable and no frontend redeploy is involved.**

### 3.1 Variables per Worker

Read from `apps/api/src/env.ts`, `apps/api/src/features.ts`, `apps/api/src/webhook-config.ts`, `apps/poller/src/env.ts` and the Poller sources.

| Name | Kind | API Worker | Poller Worker | Purpose |
| --- | --- | --- | --- | --- |
| `FEATURE_DARK_MODE` | flag, stored as a secret | yes | no effect | Turns dark mode on in `/api/features`. |
| `FEATURE_HIGH_CONTRAST` | flag, stored as a secret | yes | no effect | Turns high contrast on in `/api/features`. |
| `FEATURE_WEBHOOKS` | flag, stored as a secret | yes | yes | API: webhook routes. Poller: sends webhooks after each poll. Set it on both. |
| `FEATURE_DIGESTS` | flag, stored as a secret | yes | yes | API: digest settings and unsubscribe routes. Poller: the hourly digest run. Set it on both. |
| `WEBHOOK_MASTER_SECRET` | secret | yes | yes | At least 32 characters. Derives each webhook's signing secret. Must be the identical value on both Workers. Missing or short: the API answers 503 on the webhook routes and the Poller sends nothing. |
| `SAFE_SEND_MODE` | stored as a secret | yes | yes | On unless the value is exactly `false`. |
| `SAFE_SEND_ALLOWLIST_EMAILS` | stored as a secret | yes | yes | Comma-separated addresses. The Poller uses it for the digest. The API reads it with the webhook settings. `delivered@resend.dev` is always allowed. |
| `SAFE_SEND_ALLOWLIST_HOSTS` | stored as a secret | yes | yes | Comma-separated webhook host names that may receive a delivery while Safe_Send_Mode is on. |
| `UNSUBSCRIBE_SECRET` | secret, already set | yes | yes | Poller signs digest links. API checks them. The value must be identical on both. |
| `UNSUBSCRIBE_SECRET_PREVIOUS`, `UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT` | secret and variable, optional | yes | no | Only during a secret rotation (`docs/secret-rotation.md`). The API accepts the previous secret for checking. |
| `FRONTEND_URL` | variable, in `wrangler.jsonc` | yes | yes | Base URL for links in emails. Digest unsubscribe links use it. |
| `MAIL_FROM` | variable, in `wrangler.jsonc` | yes | yes | Sender of the digest. |
| `FAA_RELAY_URL` | secret, optional | no | yes | Not a Phase 2 flag. Set both relay secrets or neither. Value: `https://www.aerobriefs.com/api/internal/faa-relay`. With both set, the poll goes through the FAA relay on Vercel because the FAA blocks Cloudflare Workers. With both unset, the poll calls the FAA directly. Only one set, or a wrong URL, fails the poll with `validation`. See `docs/production-runbook.md`, section "FAA relay". |
| `FAA_RELAY_SECRET` | secret, optional | no | yes | Same value as `FAA_RELAY_SECRET` in the Vercel project `aero-brief` (Production scope). At least 32 characters. Set and delete it together with `FAA_RELAY_URL`. |
| `DATABASE_URL`, `RESEND_API_KEY` | secrets, already set | yes | yes | Unchanged. `DATABASE_URL` must use the runtime role. |

A flag is on only when its value is exactly `true`. Any other value, or no value, is off, and the Worker logs a warning that names the flag and not its value.

**How to set, change and remove a flag or a `SAFE_SEND_*` value.** Use a Worker secret, from the repo root in the owner's own shell:

```text
npx wrangler secret put FEATURE_DARK_MODE --name aerobrief-api
npx wrangler secret delete FEATURE_DARK_MODE --name aerobrief-api
```

Type the value at the prompt. Do not pipe it in: PowerShell piping can add a line ending, and anything other than exactly `true` is off. A secret takes effect without a deploy. To turn a flag off, delete the secret. `GET /api/features` shows which flags are on. In the steps below, "set X" means `secret put` and "delete X" means `secret delete`, on the Worker(s) named in the step.

### 3.2 What the deploy overwrites

Verified in the repo:

- `apps/api/wrangler.jsonc` and `apps/poller/wrangler.jsonc` each have a `vars` block with only `FRONTEND_URL` and `MAIL_FROM`.
- Neither file sets `keep_vars`, and the workflow passes no `--keep-vars`.
- The `FEATURE_*` and `SAFE_SEND_*` names are deliberately not in `wrangler.jsonc` (task 1.7).

**Verified result (2026-11-21).** Two manual "Deploy Workers" runs (`workflow_dispatch`, 02:33 and 02:43 UTC, both succeeded) **removed the dashboard-only text variable `ROLLOUT_CHECK` from both `aerobrief-api` and `aerobrief-poller`.** The secrets `DATABASE_URL`, `RESEND_API_KEY` and `UNSUBSCRIBE_SECRET` were still on both Workers afterwards (checked with `npx wrangler secret list --name <worker>`). So a deploy removes a plain-text variable that exists only in the dashboard, and keeps secrets.

**Decision.** The owner stores the `FEATURE_*` flags and `SAFE_SEND_MODE`, `SAFE_SEND_ALLOWLIST_EMAILS` and `SAFE_SEND_ALLOWLIST_HOSTS` as Worker secrets, not as dashboard text variables. The code reads them as plain strings, so this works the same. Set one with `npx wrangler secret put <NAME> --name <worker>`, typing the value at the prompt (not piped, see section 3.1). Remove one with `npx wrangler secret delete <NAME> --name <worker>`. A secret takes effect without a deploy, and a deploy keeps it. `GET /api/features` shows which flags are on.

Also worth knowing: the "Deploy Workers" workflow deploys only the Workers. Vercel deploys only on a push to `main`.

**Re-check (optional; repeat after a change to the workflow or to `wrangler.jsonc`, with the flags you rely on set):**

1. Run `npx wrangler secret list --name aerobrief-api` and the same with `--name aerobrief-poller`. Note the names listed.
2. Start the workflow "Deploy Workers" by hand from the Actions tab on `main` (`workflow_dispatch`).
3. Run the two `secret list` commands again. Pass: every name from step 1 is still listed. Then call `GET /api/features` and confirm the flags that were on are still on.
4. On a fail, delete the secrets of the affected flags, enable nothing else, and ask the owner how to go on. One option is `"keep_vars": true` in both `wrangler.jsonc` files, which is a change to production config and needs its own review.
## 4. Order of production steps

Do the steps in this order, one feature at a time. Finish a feature (enable, check, and decide about `SAFE_SEND_MODE`) before starting the next. For each step the plan gives what to do, how to check, and how to undo.

### Step 0. Before any feature

| | |
| --- | --- |
| Status | **Done on 2026-11-21.** Commit `73cf45e` was pushed and deployed, and all flags were verified off. |
| Do | Owner approves the push. Run `npm test` and `npm run typecheck` on `main` with all flags unset. Count cron triggers (section 2). Push `main`. Wait for the Actions run and the Vercel deploy to finish. |
| Check | The site works as before. `GET /api/features` on the API returns the same 404 as `/api/nope`. The Actions run shows both Workers deployed. The Poller shows three cron triggers. The section 3.2 result (secrets survive a deploy) is already verified. |
| Note | Production polls have been failing with FAA HTTP 403 since at least 2026-11-20 02:00 UTC. This is tracked in `.kiro/specs/faa-403-poller/` and is unrelated to Phase 2. |
| Undo | `git revert` of the pushed commits (section 6), or redeploy a previous version of a Worker from the Cloudflare dashboard (Deployments). The tag `mvp-contest-2026` marks the last pure-MVP build. |

### Step 1. Dark mode (no database)

| | |
| --- | --- |
| Status | **Enabled on 2026-11-21**, pending the owner's visual check. `FEATURE_DARK_MODE=true` was set on `aerobrief-api` and `/api/features` returned `{"darkMode":true,"highContrast":false,"digests":false,"webhooks":false}`. |
| Do | On the API Worker only: `npx wrangler secret put FEATURE_DARK_MODE --name aerobrief-api`, and type `true` at the prompt. |
| Check | `GET /api/features` returns 200 with `darkMode: true` and the others `false`. The site shows a "Display settings" section with a Theme control (System, Light, Dark). Choose Dark and reload: the choice stays. Pages still read correctly. |
| Undo | `npx wrangler secret delete FEATURE_DARK_MODE --name aerobrief-api`. With every flag off, `/api/features` returns 404 again and the Display settings section disappears. |

### Step 2. High contrast (no database)

| | |
| --- | --- |
| Do | On the API Worker only: `npx wrangler secret put FEATURE_HIGH_CONTRAST --name aerobrief-api`, and type `true` at the prompt. |
| Check | `/api/features` shows `highContrast: true`. The Display settings section has a "High contrast" checkbox. Tick it: the page switches to the high-contrast look and the choice stays after a reload. |
| Undo | `npx wrangler secret delete FEATURE_HIGH_CONTRAST --name aerobrief-api`. |

### Step 3. Signed webhooks (needs migration 0004)

Migration 0004 and its grants need the owner's approval, because they change the production database. Nothing in this repo runs them against production: `scripts/migrate-phase2.ts` refuses the production host on purpose.

**3a. Back up first.** Before any statement, create a restore point of the production branch: a Neon snapshot of `br-delicate-bar-bbqk6hwk`, or a child branch of it (a copy-on-write branch costs little). Confirm it exists in the Neon console before going on. Check Neon's current retention for snapshots and branches on your plan, which I could not verify.

**3b. Check the target.** Confirm you are connected to the production branch and not the `phase-2` branch (compare the host name with the one recorded in `docs/decisions.md`). Read-only checks:

```sql
-- the tables must not exist yet
SELECT to_regclass('public.webhooks'), to_regclass('public.webhook_deliveries');
-- does the Drizzle bookkeeping table exist on production?
SELECT schemaname, tablename FROM pg_tables WHERE tablename = '__drizzle_migrations';
```

**3c. Apply the migration.** The file is `packages/db/migrations/0004_webhooks.sql`. On the `phase-2` branch it was applied as one SQL transaction (through the Neon MCP `run_sql_transaction`), not with `drizzle-kit migrate`, because that branch has no `__drizzle_migrations` table. Do the same on production, with one transaction that stops on the first error, for example:

```text
psql "$PRODUCTION_ADMIN_URL" -1 -v ON_ERROR_STOP=1 -f packages/db/migrations/0004_webhooks.sql
```

`$PRODUCTION_ADMIN_URL` stands for the owner's own admin connection string, kept in the owner's shell. The `--> statement-breakpoint` lines in the file are SQL comments and do no harm to psql.

Do not run `drizzle-kit migrate` afterwards without checking first. `packages/db/migrations/meta/_journal.json` lists 0004 and 0005. If production's `__drizzle_migrations` table does not record a migration you applied by hand, a later `drizzle-kit migrate` may try to apply it again and fail. Either record the migration in that table in the same way drizzle-kit would, or keep applying Phase 2 migrations by hand. I did not inspect the production table, so I cannot say which case applies.

**3d. Grants.** The runtime role is `aerobrief_runtime`. On the `phase-2` branch it got its rights through default privileges, so no grant file was needed there for 0005 (`docs/decisions.md`). Do not assume production works the same way. Check with read-only queries:

```sql
-- rights the runtime role holds on the new tables (true or false per right)
SELECT t.name AS table_name, p.priv AS privilege,
       has_table_privilege('aerobrief_runtime', 'public.' || t.name, p.priv) AS granted
FROM (VALUES ('webhooks'), ('webhook_deliveries')) AS t(name)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS p(priv)
ORDER BY t.name, p.priv;

-- the same from the catalog view (shows only grants visible to the connected user)
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'aerobrief_runtime' AND table_name IN ('webhooks', 'webhook_deliveries')
ORDER BY table_name, privilege_type;

-- default privileges that may grant rights on future tables
SELECT * FROM pg_default_acl;
```

All four rights must be `true` on both tables. If any is `false`, the owner runs `packages/db/migrations/grants/0004_webhooks.grants.sql` with their runtime role name:

```text
psql "$PRODUCTION_ADMIN_URL" -v runtime_role=aerobrief_runtime -f packages/db/migrations/grants/0004_webhooks.grants.sql
```

Then run the first query again. The runtime role needs the rights listed in that file and no more.

**3e. Worker settings.** In this order:

1. Set `WEBHOOK_MASTER_SECRET` as a secret on both Workers, with the same value, at least 32 random characters (`npx wrangler secret put WEBHOOK_MASTER_SECRET --name aerobrief-api`, then the same with `--name aerobrief-poller`). The owner generates it and stores it in a password manager. Do not put it in a file or a chat.
2. Set the secret `SAFE_SEND_MODE` to `true` on both Workers (`secret put`, section 3.1).
3. Set the secret `SAFE_SEND_ALLOWLIST_HOSTS` on both Workers to the host name of the owner's own test receiver, and `SAFE_SEND_ALLOWLIST_EMAILS` to the owner's addresses.
4. Set the secret `FEATURE_WEBHOOKS` to `true` on both Workers.

**3f. Check (Safe_Send_Mode on).**

- `/api/features` shows `webhooks: true`.
- Signed in as the owner, create a webhook that points at the allowlisted test host. Send the test event. The receiver should get a signed request whose text begins "TEST:".
- Add a second webhook that points at a host that is not on the list. A real event must be recorded as skipped (`not_allowlisted`) and no request must reach that host.
- Look at the Worker logs for `webhook_master_secret_unavailable` (it should not appear) and make sure no log line holds a secret or a full webhook URL.

**3g. Undo.**

- First, delete the secret `FEATURE_WEBHOOKS` on both Workers (`npx wrangler secret delete FEATURE_WEBHOOKS --name <worker>`). The routes return 404 and the Poller sends nothing. Data stays in the tables.
- To remove the tables (this deletes webhook data, so use the 3a restore point if you need it back): run `packages/db/migrations/down/0004_webhooks.down.sql` in one transaction. Do this only with the flag off, and only with the owner's approval. If the digest is also enabled, its tables are separate and not touched by this file.
- Rotate or delete `WEBHOOK_MASTER_SECRET` only after removing the tables. Changing it makes every stored webhook sign with a new secret, and receivers would have to be updated.

### Step 4. Daily digest (needs migration 0005)

Same shape as step 3. The digest sends real email, so keep Safe_Send_Mode on until the check passes.

**4a. Back up** as in 3a (a new snapshot, taken now, not the old one).

**4b. Check the target** and that the tables are missing:

```sql
SELECT to_regclass('public.digest_preferences'), to_regclass('public.digest_deliveries');
```

**4c. Apply** `packages/db/migrations/0005_digest.sql` in one transaction, the same way as 3c.

**4d. Grants.** Run the same checks as in 3d with the tables `digest_preferences` and `digest_deliveries`. If any right is missing, run `packages/db/migrations/grants/0005_digest.grants.sql` with `-v runtime_role=aerobrief_runtime`.

**4e. Worker settings.** In this order:

1. Confirm `UNSUBSCRIBE_SECRET` is set and identical on both Workers (it already is for the MVP). Its previous-secret variables are needed only during a rotation.
2. Confirm `FRONTEND_URL` and `MAIL_FROM` (both in `wrangler.jsonc`) have their production values, so links and the sender are right.
3. Set the secrets `SAFE_SEND_MODE` to `true` and `SAFE_SEND_ALLOWLIST_EMAILS` to the owner's addresses on both Workers (skip if already set in step 3).
4. Set the secret `FEATURE_DIGESTS` to `true` on both Workers.

**4f. Check (Safe_Send_Mode on).**

- `/api/features` shows `digests: true`.
- Signed in as the owner, turn on the digest in the settings and choose an hour. At the next `0 * * * *` run the owner address receives one digest. Check that the email's unsubscribe link opens the unsubscribe page and works.
- In `digest_deliveries` (read-only query), a user who is not on the allowlist has a row with `status` `skipped` and `skip_reason` `not_allowlisted`, and no email was sent to that user. A second run in the same hour sends nothing new.
- The Worker log has no `digest_run_failed` line. If it shows `relation "digest_preferences" does not exist`, the Worker's `DATABASE_URL` points at a database without migration 0005.

**4g. Undo.**

- Delete the secret `FEATURE_DIGESTS` on both Workers. The routes return 404 and the hourly run does nothing.
- To remove the tables (deletes digest data): `packages/db/migrations/down/0005_digest.down.sql` in one transaction, flag off, owner's approval.
- The third cron stays registered while the code stays deployed. It does no work with the flag off. To remove it, `git revert` the digest range (section 6) and let the workflow redeploy.

### Step 4a. Core 30 limits (migration 0006, before the push that carries them)

This is not a Phase 2 feature and has no flag. The owner decided on 2026-11-24 to monitor the FAA Core 30 airports and to allow 30 airports per watchlist (`docs/decisions.md`). The full apply, check and rollback steps are in `docs/production-runbook.md`, "Migration 0006". The order matters:

1. Apply `0006_watchlist_cap_30.sql` to the `phase-2` Neon branch and check it there.
2. Take a restore point of production (as in 3a). The owner applies `0006` to production in one transaction. While the old code still runs, the effect is 10 unused `airports` rows and a trigger that allows 30. Nothing a user sees changes.
3. Only then push `main`. The push deploys the API Worker, then the Poller Worker, then the web app. The new API reads old 20-airport snapshots through a completion step, so the first deploy does not fail on stored data.

If the push came first, the new web app would show "of 30" while the old trigger still stops a watchlist at 10. That is why `0006` goes first.

## 5. Safe_Send_Mode: turning it off is a separate decision

The first enabling of webhooks and the digest runs with `SAFE_SEND_MODE=true`. In that mode a digest goes only to allowlisted addresses and a webhook goes only to allowlisted hosts. Everyone else is skipped and recorded as `not_allowlisted`.

Setting the secret `SAFE_SEND_MODE` to `false` lets real users get email and webhook calls. Make it as its own decision, after the checks in 3f and 4f have passed and the owner has looked at the logs. Do it one feature at a time, on both Workers. It does not need a deploy. To undo, delete the secret `SAFE_SEND_MODE` (absent means on) or set it back to `true`. Sends that already happened cannot be recalled.

Billing and other commercial use of the data wait for a review of the FAA data terms (`scope.md`). Turning off Safe_Send_Mode is not that review.

## 6. Rollback

Use the lightest step that fixes the problem.

1. **Flag off.** Delete the feature's flag secret on the Worker(s) in section 3.1 (`npx wrangler secret delete <NAME> --name <worker>`). Takes effect at once, with no deploy and no data loss. With all four off the app is back to MVP behavior. This is always the first step.
2. **Down migration.** Only if the feature's tables must go, and only after the flag is off: `packages/db/migrations/down/0004_webhooks.down.sql` or `packages/db/migrations/down/0005_digest.down.sql`, each in one transaction, each with the owner's approval. These files drop the tables, so the data is gone unless you restore from the section 4 backup. They are not in the Drizzle journal, so drizzle-kit never runs them.
3. **`git revert`.** Removes the code. (The Core 30 limits have no flag. To undo them, revert that commit range, wait for the Workers to redeploy, and only then run `packages/db/migrations/down/0006_watchlist_cap_30.down.sql` in one transaction with the owner's approval. See `docs/production-runbook.md`, "Migration 0006".) Revert the newest feature first, with no commit until all reverts are staged, then review and commit. The ranges on `main` (checked against `git log`; they are consecutive in this order):

   | Feature | Commits |
   | --- | --- |
   | Daily digest | `e5959c3` to `bbd419e` |
   | Signed webhooks | `c8bb274` to `95da9f8` |
   | High contrast | `fa2d6fa` |
   | Dark mode | `989708e` |
   | Setup (flags, `/api/features`, guards) | `556907b` |

   ```text
   git revert --no-commit e5959c3^..bbd419e   # digest range, check the range with git log first
   ```

   Run `git log --oneline` and confirm the first and last commit of each range before reverting. Order matters because of shared code: the digest uses `packages/core/src/safe-send.ts`, which the webhooks range created, so revert the digest before webhooks. High contrast extends the theme files that dark mode created, so revert high contrast before dark mode. Revert the setup commit last, if at all. Run `npm test` and `npm run typecheck` before committing the revert. Pushing the revert deploys it, so it follows the same push rules as section 2.
4. **Delete `phase-2`.** If the whole branch fails, delete the `phase-2` Git branch. `main` and tag `mvp-contest-2026` (commit `fff8374`) are the contest MVP and stay as they are. The Neon `phase-2` branch can also be deleted in the Neon console. Production is not touched by either deletion.

After December 4, 2026, 2:00 PM PT, `main` is frozen until judging has finished. Do not push a revert or any other change to `main` in that period unless the owner decides to.

## 7. What no agent does

- No agent pushes, tags, deploys, sets a Worker secret, runs a migration or grant on production, or turns Safe_Send_Mode off.
- Agents may write code and docs and run tests. Database work from agents stays on the `phase-2` Neon branch, behind `scripts/migrate-phase2.ts`.
- The owner reads each step, approves it, and does it from the owner's own shell and dashboards.
