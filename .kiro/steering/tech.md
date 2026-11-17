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
