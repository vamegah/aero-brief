---
inclusion: always
---

# Tech Stack

This stack is fixed. Build within it.

## Language

- TypeScript in strict mode everywhere (`"strict": true` in every tsconfig). No plain JavaScript source files.

## Backend

- Cloudflare Workers for both the poller and the API.
- No always-on servers. No Express. No EC2.

## Database

- Neon Postgres, accessed through Drizzle ORM.

## Frontend

- React 18 + Vite.
- Deployed on Vercel.

## Email

- Resend for transactional email.

## Testing

- Vitest for unit tests.
- fast-check for property-based tests.

## CI

- GitHub Actions.

## Rule: no unflagged deviations

Never suggest a technology outside this list without flagging the deviation explicitly. State that it is outside the approved stack, why it is needed, and what in-stack option was considered. Wait for the user's approval before using it.

## Deployment

- Frontend: Vercel Git integration, auto-deploys on push to `main`.
- Workers: GitHub Actions (`.github/workflows/deploy-workers.yml`) with `cloudflare/wrangler-action`.

## Approved exceptions

- One Vercel Function, `apps/web/api/internal/faa-relay.ts`, fetches only the fixed FAA URL on behalf of the poller, because the FAA edge blocks Cloudflare Workers egress. Approved by the owner on 2026-11-22. See `.kiro/specs/faa-403-poller/design.md` and `docs/decisions.md`.
- This exception permits no other Vercel Functions and no other backend logic on Vercel. The "no unflagged deviations" rule above still applies to everything else.
