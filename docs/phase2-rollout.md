# Phase 2 production rollout plan

This plan covers how to turn on the four Phase 2 features in production: dark mode, high contrast, signed webhooks and the daily digest. It is a checklist for the project owner. No agent runs any step in it.

**The project owner decides when to enable anything and is the only one who pushes `main`.** Every step that touches production (a push, a Worker variable, a migration, a grant) needs the owner's approval first. Nothing here is urgent. With every flag off, the app behaves exactly like the MVP, so the order and the timing are the owner's choice.

## 1. Facts this plan relies on

| Item | Value | Where it comes from |
| --- | --- | --- |
| Neon project | `bitter-fire-42970215` | `docs/decisions.md` |
| Production branch | `br-delicate-bar-bbqk6hwk` (named `production`) | `docs/decisions.md` |
| Phase 2 test branch | `br-odd-feather-bbpy60hl` (named `phase-2`) | `docs/decisions.md` |
| Runtime database role | `aerobrief_runtime` | `docs/decisions.md` |
| Contest MVP | tag `mvp-contest-2026`, commit `fff8374` | `git` |
| Migrations applied only to the `phase-2` Neon branch | `0004_webhooks`, `0005_digest` | `docs/decisions.md` |

Not recorded anywhere in this repo: any connection string, password or secret value. This plan has none either. Never paste one into this file, a commit message or a chat.

## 2. What a push to `main` does

- `.github/workflows/deploy-workers.yml` runs on a push to `main` that changes `apps/api/**`, `apps/poller/**`, `packages/**` or the workflow file. It can also be started by hand (`workflow_dispatch`). The job has `if: github.ref == 'refs/heads/main'`, so no other branch deploys the production Workers. It deploys the API Worker, then the Poller Worker, with `cloudflare/wrangler-action@v3`.
- Vercel deploys the frontend from `main` on every push.
- At the time of writing, local `main` (at `bbd419e`) is ahead of `origin/main` (at `fff8374`). The local commits are the merged Phase 2 work with all flags off. Nothing has been pushed.
- With every flag unset or `false`, the deployed code behaves like the MVP: `/api/features` answers the same 404 as any unknown path, the webhook and digest routes do the same, the Poller makes no webhook or digest query, and the pages look as before.
- **The push also registers a third cron trigger on the Poller (`0 * * * *`, the digest).** `apps/poller/wrangler.jsonc` now lists three crons (`*/5 * * * *` poll, `*/30 * * * *` cleanup, `0 * * * *` digest). Cloudflare limits cron triggers per account: 5 on the Free plan and 250 on the Paid plan (figures from the project brief; confirm on Cloudflare's current limits page). Before pushing, count the cron triggers already used by all Workers in the account. If the new one does not fit, the Poller deploy fails.
- After the deadline (December 4, 2026, 2:00 PM PT) `main` is frozen until judging has finished (`.kiro/steering/scope.md`). Before it, the contest set (dark mode, high contrast, daily digest, signed webhooks) may go to `main` one feature at a time, after its tests pass with the flag off and on.

## 3. Where each setting lives

The frontend gets its flags from `GET /api/features`, which the API Worker answers (`apps/web/src/features/FeaturesProvider.tsx`). The frontend reads no flag from a build variable, the URL or local storage. So **enabling a feature is a Worker-side change only. No Vercel variable and no frontend redeploy is involved.**

### 3.1 Variables per Worker

Read from `apps/api/src/env.ts`, `apps/api/src/features.ts`, `apps/api/src/webhook-config.ts`, `apps/poller/src/env.ts` and the Poller sources.

| Name | Kind | API Worker | Poller Worker | Purpose |
| --- | --- | --- | --- | --- |
| `FEATURE_DARK_MODE` | flag | yes | no effect | Turns dark mode on in `/api/features`. |
| `FEATURE_HIGH_CONTRAST` | flag | yes | no effect | Turns high contrast on in `/api/features`. |
| `FEATURE_WEBHOOKS` | flag | yes | yes | API: webhook routes. Poller: sends webhooks after each poll. Set it on both. |
| `FEATURE_DIGESTS` | flag | yes | yes | API: digest settings and unsubscribe routes. Poller: the hourly digest run. Set it on both. |
| `WEBHOOK_MASTER_SECRET` | secret | yes | yes | At least 32 characters. Derives each webhook's signing secret. Must be the identical value on both Workers. Missing or short: the API answers 503 on the webhook routes and the Poller sends nothing. |
| `SAFE_SEND_MODE` | variable | yes | yes | On unless the value is exactly `false`. |
| `SAFE_SEND_ALLOWLIST_EMAILS` | variable | yes | yes | Comma-separated addresses. The Poller uses it for the digest. The API reads it with the webhook settings. `delivered@resend.dev` is always allowed. |
| `SAFE_SEND_ALLOWLIST_HOSTS` | variable | yes | yes | Comma-separated webhook host names that may receive a delivery while Safe_Send_Mode is on. |
| `UNSUBSCRIBE_SECRET` | secret, already set | yes | yes | Poller signs digest links. API checks them. The value must be identical on both. |
| `UNSUBSCRIBE_SECRET_PREVIOUS`, `UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT` | secret and variable, optional | yes | no | Only during a secret rotation (`docs/secret-rotation.md`). The API accepts the previous secret for checking. |
| `FRONTEND_URL` | variable, in `wrangler.jsonc` | yes | yes | Base URL for links in emails. Digest unsubscribe links use it. |
| `MAIL_FROM` | variable, in `wrangler.jsonc` | yes | yes | Sender of the digest. |
| `DATABASE_URL`, `RESEND_API_KEY` | secrets, already set | yes | yes | Unchanged. `DATABASE_URL` must use the runtime role. |

A flag is on only when its value is exactly `true`. Any other value, or no value, is off, and the Worker logs a warning that names the flag and not its value.

### 3.2 What the deploy overwrites

Verified in the repo:

- `apps/api/wrangler.jsonc` and `apps/poller/wrangler.jsonc` each have a `vars` block with only `FRONTEND_URL` and `MAIL_FROM`.
- Neither file sets `keep_vars`, and the workflow passes no `--keep-vars`. Cloudflare's guidance (community answers, [Cloudflare community thread](https://community.cloudflare.com/t/keep-vars-not-working-as-expected/831643)) is that a deploy replaces dashboard variables with the ones in the config, and `keep_vars = true` turns that off. So **a deploy can remove a plain-text variable that you added only in the dashboard.** Secrets set with `wrangler secret put` are kept by a deploy as far as I know, but I did not confirm that in this environment. Run the check below instead of trusting this.
- The `FEATURE_*` and `SAFE_SEND_*` names are deliberately not in `wrangler.jsonc` (task 1.7).

**Check before relying on dashboard variables (do this once, with every flag still off):**

1. In the Cloudflare dashboard, open each Worker (`aerobrief-api`, `aerobrief-poller`), Settings, Variables and Secrets. Add a harmless text variable `ROLLOUT_CHECK` with the value `1` on both. Note the secret names that are listed.
2. Start the workflow "Deploy Workers" by hand from the Actions tab on `main` (`workflow_dispatch`). With all flags off this deploys MVP behavior.
3. Open the same dashboard pages again. Pass: `ROLLOUT_CHECK` and every secret name are still there. Fail: `ROLLOUT_CHECK` is gone or a secret is missing.
4. On a fail, do not enable anything. Choose one, with the owner's approval:
   - Add `"keep_vars": true` to both `wrangler.jsonc` files, commit, push, and repeat the check. This is a change to production config, so it needs its own review.
   - Set the flags and allowlists as secrets with `wrangler secret put` instead of dashboard text variables. The code reads them as plain strings, so this works the same.
5. Delete `ROLLOUT_CHECK` when done. Re-check after every later deploy that the flags you set are still present.

## 4. Order of production steps

Do the steps in this order, one feature at a time. Finish a feature (enable, check, and decide about `SAFE_SEND_MODE`) before starting the next. For each step the plan gives what to do, how to check, and how to undo.

### Step 0. Before any feature

| | |
| --- | --- |
| Do | Owner approves the push. Run `npm test` and `npm run typecheck` on `main` with all flags unset. Count cron triggers (section 2). Push `main`. Wait for the Actions run and the Vercel deploy to finish. |
| Check | The site works as before. `GET /api/features` on the API returns the same 404 as `/api/nope`. The Actions run shows both Workers deployed. The Poller shows three cron triggers. Then run the section 3.2 check. |
| Undo | `git revert` of the pushed commits (section 6), or redeploy a previous version of a Worker from the Cloudflare dashboard (Deployments). The tag `mvp-contest-2026` marks the last pure-MVP build. |

### Step 1. Dark mode (no database)

| | |
| --- | --- |
| Do | On the API Worker only, set `FEATURE_DARK_MODE` to `true`. |
| Check | `GET /api/features` returns 200 with `darkMode: true` and the others `false`. The site shows a "Display settings" section with a Theme control (System, Light, Dark). Choose Dark and reload: the choice stays. Pages still read correctly. |
| Undo | Set `FEATURE_DARK_MODE` to `false` or delete it. With every flag off, `/api/features` returns 404 again and the Display settings section disappears. |

### Step 2. High contrast (no database)

| | |
| --- | --- |
| Do | On the API Worker only, set `FEATURE_HIGH_CONTRAST` to `true`. |
| Check | `/api/features` shows `highContrast: true`. The Display settings section has a "High contrast" checkbox. Tick it: the page switches to the high-contrast look and the choice stays after a reload. |
| Undo | Set `FEATURE_HIGH_CONTRAST` to `false` or delete it. |

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

1. Set `WEBHOOK_MASTER_SECRET` as a secret on both Workers, with the same value, at least 32 random characters (`wrangler secret put WEBHOOK_MASTER_SECRET` in `apps/api` and in `apps/poller`). The owner generates it and stores it in a password manager. Do not put it in a file or a chat.
2. Set `SAFE_SEND_MODE` to `true` on both Workers.
3. Set `SAFE_SEND_ALLOWLIST_HOSTS` on both Workers to the host name of the owner's own test receiver, and `SAFE_SEND_ALLOWLIST_EMAILS` to the owner's addresses.
4. Set `FEATURE_WEBHOOKS` to `true` on both Workers.

**3f. Check (Safe_Send_Mode on).**

- `/api/features` shows `webhooks: true`.
- Signed in as the owner, create a webhook that points at the allowlisted test host. Send the test event. The receiver should get a signed request whose text begins "TEST:".
- Add a second webhook that points at a host that is not on the list. A real event must be recorded as skipped (`not_allowlisted`) and no request must reach that host.
- Look at the Worker logs for `webhook_master_secret_unavailable` (it should not appear) and make sure no log line holds a secret or a full webhook URL.

**3g. Undo.**

- First, set `FEATURE_WEBHOOKS` to `false` on both Workers. The routes return 404 and the Poller sends nothing. Data stays in the tables.
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
3. Set `SAFE_SEND_MODE` to `true` and `SAFE_SEND_ALLOWLIST_EMAILS` to the owner's addresses on both Workers (skip if already set in step 3).
4. Set `FEATURE_DIGESTS` to `true` on both Workers.

**4f. Check (Safe_Send_Mode on).**

- `/api/features` shows `digests: true`.
- Signed in as the owner, turn on the digest in the settings and choose an hour. At the next `0 * * * *` run the owner address receives one digest. Check that the email's unsubscribe link opens the unsubscribe page and works.
- In `digest_deliveries` (read-only query), a user who is not on the allowlist has a row with `status` `skipped` and `skip_reason` `not_allowlisted`, and no email was sent to that user. A second run in the same hour sends nothing new.
- The Worker log has no `digest_run_failed` line. If it shows `relation "digest_preferences" does not exist`, the Worker's `DATABASE_URL` points at a database without migration 0005.

**4g. Undo.**

- Set `FEATURE_DIGESTS` to `false` on both Workers. The routes return 404 and the hourly run does nothing.
- To remove the tables (deletes digest data): `packages/db/migrations/down/0005_digest.down.sql` in one transaction, flag off, owner's approval.
- The third cron stays registered while the code stays deployed. It does no work with the flag off. To remove it, `git revert` the digest range (section 6) and let the workflow redeploy.

## 5. Safe_Send_Mode: turning it off is a separate decision

The first enabling of webhooks and the digest runs with `SAFE_SEND_MODE=true`. In that mode a digest goes only to allowlisted addresses and a webhook goes only to allowlisted hosts. Everyone else is skipped and recorded as `not_allowlisted`.

Setting `SAFE_SEND_MODE=false` lets real users get email and webhook calls. Make it as its own decision, after the checks in 3f and 4f have passed and the owner has looked at the logs. Do it one feature at a time, on both Workers. It does not need a deploy. To undo, set `SAFE_SEND_MODE` back to `true` (or delete it, since absent means on). Sends that already happened cannot be recalled.

Billing and other commercial use of the data wait for a review of the FAA data terms (`scope.md`). Turning off Safe_Send_Mode is not that review.

## 6. Rollback

Use the lightest step that fixes the problem.

1. **Flag off.** Set the feature's flag to `false` on the Worker(s) in section 3.1. Takes effect at once, with no deploy and no data loss. With all four off the app is back to MVP behavior. This is always the first step.
2. **Down migration.** Only if the feature's tables must go, and only after the flag is off: `packages/db/migrations/down/0004_webhooks.down.sql` or `packages/db/migrations/down/0005_digest.down.sql`, each in one transaction, each with the owner's approval. These files drop the tables, so the data is gone unless you restore from the section 4 backup. They are not in the Drizzle journal, so drizzle-kit never runs them.
3. **`git revert`.** Removes the code. Revert the newest feature first, with no commit until all reverts are staged, then review and commit. The ranges on `main` (checked against `git log`; they are consecutive in this order):

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

- No agent pushes, tags, deploys, sets a Worker variable or secret, runs a migration or grant on production, or turns Safe_Send_Mode off.
- Agents may write code and docs and run tests. Database work from agents stays on the `phase-2` Neon branch, behind `scripts/migrate-phase2.ts`.
- The owner reads each step, approves it, and does it from the owner's own shell and dashboards.
