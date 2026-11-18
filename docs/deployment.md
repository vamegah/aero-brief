# Deployment

| Part | How it deploys | Trigger |
|---|---|---|
| Frontend (`apps/web`) | Vercel Git integration | Every push to `main` |
| API Worker (`apps/api`) and Poller Worker (`apps/poller`) | `.github/workflows/deploy-workers.yml` using `cloudflare/wrangler-action@v3` | Push to `main` that touches `apps/api/**`, `apps/poller/**`, `packages/**` or the workflow file |

`.github/workflows/ci.yml` only runs tests on pull requests. It never deploys. No workflow uses the Vercel CLI.

Worker config lives in `apps/api/wrangler.jsonc` and `apps/poller/wrangler.jsonc`. Neither file holds secrets. Secrets are set only with `wrangler secret put`.

## One-time setup

### 1. Vercel (frontend)

1. In Vercel, choose **Add New > Project** and import `vamegah/aero-brief`.
2. Set **Root Directory** to `apps/web`. Leave the framework preset as Vite.
3. Under **Environment Variables**, add any `VITE_*` variables the web app reads. The app currently reads none, so this list is empty today. Add variables here only if you introduce them in code.
4. `apps/web/vercel.json` already rewrites `/api/:path*` to `https://aerobrief-api.vamegah.workers.dev`. Confirm that host matches your deployed API Worker (change it if you use a custom API domain). Without a correct target, `/api` calls from the site fail.
5. Deploy. Then open **Settings > Domains** to add your domain and follow the DNS instructions Vercel shows.
6. Set `FRONTEND_URL` in both `wrangler.jsonc` files to the final site URL. It is non-secret and is used in emailed links.

### 2. GitHub secret for Worker deploys

1. In Cloudflare, go to **My Profile > API Tokens > Create Token**. Create a custom token with the permission **Account > Workers Scripts > Edit**. Scope it to your account.
2. In GitHub, open **Settings > Secrets and variables > Actions > New repository secret**.
3. Name it `CLOUDFLARE_API_TOKEN` and paste the token.

If `wrangler deploy` reports a missing account, also add a `CLOUDFLARE_ACCOUNT_ID` secret and pass it as `accountId` to both wrangler-action steps.

### 3. Worker secrets

Set these once per Worker. Wrangler prompts for the value, so it never lands in shell history or a file. Run from the repo root after `npm ci`, and log in first with `npx wrangler login`.

```
cd apps/api
npx wrangler secret put DATABASE_URL
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put UNSUBSCRIBE_SECRET

cd ../poller
npx wrangler secret put DATABASE_URL
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put UNSUBSCRIBE_SECRET
```

`UNSUBSCRIBE_SECRET` must be identical in both Workers, because the poller signs unsubscribe links and the API verifies them. Use the least-privilege runtime database role for `DATABASE_URL`, as described in `docs/production-runbook.md`.

Secrets can be set before the first deploy only if the Worker already exists. If `secret put` says the Worker is not found, run the first deploy (push to `main`, or `npx wrangler deploy` in each app), then set the secrets and redeploy.

## Verify a deploy

- **Workers workflow:** GitHub **Actions > Deploy Workers**. Both wrangler-action steps should be green.
- **API:** `curl https://<api-host>/api/health` should return a healthy response.
- **Live logs:** `npx wrangler tail aerobrief-api` and `npx wrangler tail aerobrief-poller` from the matching app directory.
- **Poller crons:** the Cloudflare dashboard shows the `*/5 * * * *` and `*/30 * * * *` triggers on `aerobrief-poller`. Watch `wrangler tail` for a scheduled invocation within five minutes.
- **Frontend:** Vercel **Deployments** tab, open the latest deployment, and check **Build Logs** and the status. Then load the site and confirm the dashboard loads data.

## Notes

- Vercel auto-deploys the frontend on every push to `main`. Workers deploy through the new workflow. A push that changes only `apps/web` deploys the frontend and skips the Workers.
- Overlapping pushes to `main` cancel the in-progress Workers deploy. The newest push wins.
- Docs-only changes do not trigger the Workers workflow.
