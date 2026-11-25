# AeroBrief: Devpost submission copy (Task 14.7)

Copy each section into the matching Devpost field. The "Judge testing notes" section goes only in the private field. The checklist at the end is for the team and is not submitted.

## Category

**Frankenstein.** AeroBrief stitches a government aviation feed, Cloudflare Workers cron jobs, serverless Postgres, a property-tested pure TypeScript core, email-as-login, and an accessibility-tested React app into one crisis tool that keeps answering when the FAA's own page does not.

## Project name and tagline

**AeroBrief.** Why your airport is disrupted, in plain language, even when the FAA page is down.

## Inspiration

On November 13, 2026, a nationwide ground stop halted U.S. flights. The FAA's public status page went down. Airline apps said "delayed" and gave no reason. Travelers and logistics dispatchers had no independent place to learn what was happening or why.

AeroBrief is that place. It is an independent monitor of the FAA NAS Status API. It does not depend on the FAA's public page, and it explains each event in plain language instead of FAA codes.

## What it does

The submission is `main` as of the deadline, December 4, 2026, 2:00 PM PT. The app is at https://www.aerobriefs.com. The list below describes what the code on `main` does. All four Phase 2 flags are on in production (verified by the owner on 2026-11-25; see "Additions behind feature flags").

- **Status dashboard.** The "National status" page has three sections in a menu: Overview (a summary card and the latest events), Events (the last 24 hours, with filters) and Airports (a table of the 30 airports we monitor, sorted with ground stops first). An "All (30) / Affected only" filter and a search box narrow the table. The overall status reads Normal (green), Ground stops active (amber) or System-wide disruption (red); the text carries the meaning and the color only repeats it.
- **Ground stop details.** A stopped airport's row shows the reason in plain language, "Expected to end around <time> UTC" or "Until further notice", and a link to the FAA advisory. Only `https://` links on `faa.gov` are shown; otherwise the link goes to the FAA status page.
- **Airport page.** Each airport code links to `/airport/<code>`, which shows that airport's current status, its details, the last-updated time and its events from the last 24 hours.
- **Plain-language events.** The last 24 hours of ground stop starts and ends appear as event cards. Each has a written explanation of the cause, not a raw FAA code.
- **System-wide banner.** When ground stops affect three or more FAA centers (ARTCCs) at once, the dashboard shows a "System-wide disruption" banner with an explanation.
- **Stale-data banner.** If the latest stored data is more than 10 minutes old, the dashboard says so and shows the last update time. Every status carries a last-updated time.
- **Cached fallback.** The dashboard is served from our database, not from the FAA at request time. If a refresh fails, the page keeps the last data and shows an error message instead of going blank.
- **Passwordless sign-in.** Enter an email, get a one-time magic link that expires in 15 minutes and works once. There are no passwords.
- **Watchlist.** Follow up to 30 of the 30 airports. A 31st add is refused with a message that says the Watchlist already has 30 airports.
- **Settings page.** One page at `/settings` with a section menu: Display, Daily digest, Webhooks and Account. A section appears only when its feature flag is on, except Account, which is always there. Signed-out visitors are asked to sign in for the sections that need a session.
- **Email alerts.** Sent when a ground stop starts or ends at a watched airport, and for nationwide events. Alerts pause while data is stale.
- **One-click unsubscribe.** Each ground stop alert carries a signed unsubscribe link.

## Additions behind feature flags

Git tag `mvp-contest-2026` marks the MVP restore point. Four additions were built after it on the `phase-2` branch. Each sits behind its own feature flag. All four flags are on in production (verified by the owner on 2026-11-25), and `main` as of the deadline includes them:

- **Dark mode** (`FEATURE_DARK_MODE`).
- **High-contrast AAA theme** (`FEATURE_HIGH_CONTRAST`).
- **Signed webhooks** (`FEATURE_WEBHOOKS`): outbound, signed, retried deliveries of ground stop events.
- **Daily digest email** (`FEATURE_DIGESTS`).

Webhooks and the digest need migrations 0004 and 0005. Migrations 0004 to 0006 are applied to the production database, each after a Neon restore-point branch (`docs/kiro-usage.md`, "Phase 2: features behind flags"; procedure in `docs/phase2-rollout.md`). Safe_Send_Mode is on: digests and webhooks go only to allowlisted recipients and hosts (`packages/core/src/safe-send.ts`), so this file does not claim that every user receives them. With every flag off, the code behaves as the MVP does, apart from the limits below. Nothing else from the Phase 2 plan is built.

The owner raised the limits on 2026-11-24 (`docs/decisions.md`): the app monitors the 30 FAA Core 30 airports (up from 20), a watchlist holds 30 airports (up from 10), and history stays at 24 hours. That change needs migration 0006 in the production database (`docs/production-runbook.md`, "Migration 0006"). The Poller reads old 20-airport snapshots and completes them, so a deploy does not break on stored data.

The FAA blocks requests from Cloudflare Workers with HTTP 403. The Poller therefore asks one small Vercel Function (`apps/web/api/internal/faa-relay.ts`) to fetch the fixed FAA URL for it. The function does nothing else. The approval is in `docs/decisions.md` (2026-11-22) and the steps are in `docs/production-runbook.md` ("FAA relay").

## How we built it

The stack is fixed and serverless:

- A **Cloudflare Worker** runs on a 5-minute cron. It fetches the FAA airport events feed, validates it with Zod, normalizes it to exactly 30 airports (the FAA Core 30), and stores a snapshot in **Neon Postgres** through **Drizzle ORM**. A second 30-minute cron deletes data older than 24 hours.
- A **pure TypeScript core** (`packages/core`) holds the change detector, explanation mapper, event keys, watchlist rules and unsubscribe signing. It has no I/O. **fast-check** property tests (85 `*.pbt.test.ts` files across the repo on 2026-11-25) check it against the correctness properties in the design.
- A second **Worker** serves a hand-written JSON API for status, history, sign-in and watchlists.
- **Resend** sends magic links and alerts. A small shared client retries and sets an `Idempotency-Key` so a retried poll cannot email a user twice about the same event.
- **React 18 + Vite** on **Vercel** renders the dashboard. Colors are tokens, and a test checks every color pair against WCAG 2.1 AA contrast. A vitest-axe suite checks every page.

How Kiro was used: the Kiro IDE only, with built-in sub-agents (no custom agents) and no Kiro powers. One spec (18 requirements, 38 design properties, 20 task sections) drove the build, with tasks that cite requirements and property tests that cite design properties. Five steering files fix the stack, structure, MVP scope, visual design and product tone, and `tests/repo-guard.test.ts` turns some of those rules into a failing test. The Neon MCP tools were used for read-only checks of production during the live smoke test (recorded in `docs/decisions.md`). Two agent hooks are defined in `.kiro/hooks/` (typecheck and test after the agent saves a file, and a test reminder before a write under `packages/core/src/`); `docs/hooks.md` describes them and their limits. The flagged additions came from a second spec (`.kiro/specs/aerobrief-phase2/`, 21 design properties) and the Phase 2 section of the scope steering file, which requires a flag per feature and a rollback rule. One of its property tests caught a real bug: the digest unsubscribe signature check accepted more than one string for the same signature. Three later specs cover the FAA relay fix (`.kiro/specs/faa-403-poller/`), the Status and Settings redesign (`.kiro/specs/ui-refresh/`) and the move to 30 airports and a 30-airport watchlist (`.kiro/specs/core30-limits/`). The full account is in [`docs/kiro-usage.md`](kiro-usage.md).

## Challenges

- **Missing identifiers.** The FAA feed does not always give a stable ID for a ground stop. We derive an event ID with fallbacks so the same stop is not alerted twice, and property tests cover the derivation.
- **No duplicate emails.** Poll retries, overlapping runs and email retries all had to be safe. We combined a poller lease, a unique key on events, a unique key on the alert log, and the Resend idempotency key.
- **Honest stale data.** The app must keep working when the FAA does not, without presenting old data as fresh. Staleness is computed on the server from the capture time, and alerts are gated on it.
- **Accessibility under a visual redesign.** The design system was added after the tests existed. The rule was to restyle with CSS and keep the tested DOM structure.

## Accomplishments

- A deployed, working pipeline: cron poll, stored snapshots, live dashboard, and real email through our own verified domain.
- 85 property-based test files over the core logic, plus unit, component and accessibility tests.
- Sign-in, alerts and unsubscribe with no passwords stored anywhere.

## What we learned

- Writing the correctness properties first made the detector and the de-duplication logic much easier to get right than example tests alone.
- Keeping pure logic apart from I/O meant most of the system could be tested with no mocks.
- A stale-data state needs its own design, not an afterthought.

## What's next

These come from the items we deferred on purpose in `.kiro/specs/ui-improvements/requirements.md` and from `docs/decisions.md`. Each one needs data or a decision first. None is promised.

- Support ground delay programs and airport closures, which the app does not track yet. They would add the Minor Impact and Disrupted statuses.
- Group the Airports table by status, with a watch star and sortable headers.
- Redesign the airport detail page.
- Add 7 and 30 day history. This needs a decision to change the 24-hour limit.
- Add a digest preview and a time zone choice for the digest. This needs a database migration.
- Add Terms and Privacy pages once the owner has legal text.
- Add organization features. They come after judging.
## Built with

TypeScript (strict), Cloudflare Workers, Neon Postgres, Drizzle ORM, Zod, React 18, Vite, Vercel, Resend, Vitest, fast-check, vitest-axe, GitHub Actions, Kiro.

## Try it

- App: https://www.aerobriefs.com
- Source: https://github.com/vamegah/aero-brief
- Demo video: _add the public YouTube URL after task 14.4_

## Judge testing notes (PRIVATE Devpost field only)

- Open https://www.aerobriefs.com/sign-in and enter any email address you own. Use the `www` address, because the API only accepts sign-in requests from that origin.
- Open the emailed magic link within 15 minutes. It works once. The email comes from `alerts@aerobriefs.com`.
- Go to https://www.aerobriefs.com/watchlist and add airports (up to 30). The watchlist also works signed out, stored in your browser.
- No password and no test account is needed.
- Alert emails are sent only when the real FAA feed shows a ground stop starting or ending at a watched airport. An alert may not arrive during judging. The demo video shows one.
- The stale-data banner appears only when the poller has fallen 10 minutes behind, so it will normally not be visible. The way we showed it is in `docs/demo-script.md` ("Stale banner"): override the `/api/status/national` response in browser DevTools so it returns `"stale": true`. This changes only your own browser.
- To remove your data, open Settings, the "Account" section, and use "Delete account" (`apps/web/src/components/AccountSection.tsx`).
- Digests and webhooks are limited by Safe_Send_Mode to allowlisted recipients, so a judge's address will not receive a digest.

## Submission checklist (team use, not submitted)

- [ ] Category selected: Frankenstein
- [ ] GitHub repo public, `.kiro/` at the root and not ignored, MIT license visible in About (task 14.5)
- [ ] Working URL: https://www.aerobriefs.com
- [ ] Text description pasted from this file
- [ ] Public YouTube demo under 3 minutes (task 14.4, pending). Public, not unlisted, per task 14.7
- [x] Kiro write-up: `docs/kiro-usage.md` updated for the Kiroween questions (task 14.8)
- [ ] Optional, Social Blitz: post with `#KiroweenHackathon26` at the start (task 15.2)
- [ ] Optional, Bonus Blog: public post mentioning Kiroween 2026 (task 15.1)
- [ ] Submit before the deadline: Dec 4, 2026, 2:00 PM PT
