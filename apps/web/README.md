# @aerobrief/web

React 18 + Vite frontend, deployed on Vercel.

## Before deploying

`vercel.json` contains a placeholder API host:
`https://aerobrief-api.<your-subdomain>.workers.dev`. Replace `<your-subdomain>`
with your Cloudflare Workers subdomain (or the API Worker's real URL) before deploying.

Rewrites: `/api/*` goes to the API Worker (listed first). `/auth/callback`,
`/unsubscribe`, `/sign-in` and `/watchlist` fall back to `/index.html`. Add any new
client route there. `/api` is never matched by the SPA rules.

## Scripts

`dev` (proxies `/api` to `http://localhost:8787`), `build`, `typecheck`, `preview`.
