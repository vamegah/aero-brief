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

Live today at https://www.aerobriefs.com:

- **National status dashboard.** A summary card, and a table of the 20 airports we monitor, sorted with ground stops first. An "All (20) / Affected only" filter narrows the table. The overall status reads Normal (green), Ground stops active (amber) or System-wide disruption (red); the text carries the meaning and the color only repeats it.
- **Ground stop details.** A stopped airport's row shows the reason in plain language, "Expected to end around <time> UTC" or "Until further notice", and a link to the FAA advisory. Only `https://` links on `faa.gov` are shown; otherwise the link goes to the FAA status page.
- **Airport page.** Each airport code links to `/airport/<code>`, which shows that airport's current status, its details, the last-updated time and its events from the last 24 hours.
- **Plain-language events.** The last 24 hours of ground stop starts and ends appear as event cards. Each has a written explanation of the cause, not a raw FAA code.
- **System-wide banner.** When ground stops affect three or more FAA centers (ARTCCs) at once, the dashboard shows a "System-wide disruption" banner with an explanation.
- **Stale-data banner.** If the latest stored data is more than 10 minutes old, the dashboard says so and shows the last update time. Every status carries a last-updated time.
- **Cached fallback.** The dashboard is served from our database, not from the FAA at request time. If a refresh fails, the page keeps the last data and shows an error message instead of going blank.
- **Passwordless sign-in.** Enter an email, get a one-time magic link that expires in 15 minutes and works once. There are no passwords.
- **Watchlist.** Follow up to 10 of the 20 airports.
- **Email alerts.** Sent when a ground stop starts or ends at a watched airport, and for nationwide events. Alerts pause while data is stale.
- **One-click unsubscribe.** Each ground stop alert carries a signed unsubscribe link.

## How we built it

The stack is fixed and serverless:

- A **Cloudflare Worker** runs on a 5-minute cron. It fetches the FAA airport events feed, validates it with Zod, normalizes it to exactly 20 airports, and stores a snapshot in **Neon Postgres** through **Drizzle ORM**. A second 30-minute cron deletes data older than 24 hours.
- A **pure TypeScript core** (`packages/core`) holds the change detector, explanation mapper, event keys, watchlist rules and unsubscribe signing. It has no I/O. **fast-check** property tests (44 `*.pbt.test.ts` files) check it against the correctness properties in the design.
- A second **Worker** serves a hand-written JSON API for status, history, sign-in and watchlists.
- **Resend** sends magic links and alerts. A small shared client retries and sets an `Idempotency-Key` so a retried poll cannot email a user twice about the same event.
- **React 18 + Vite** on **Vercel** renders the dashboard. Colors are tokens, and a test checks every color pair against WCAG 2.1 AA contrast. A vitest-axe suite checks every page.

How Kiro was used: the Kiro IDE only, with built-in sub-agents (no custom agents) and no Kiro powers. One spec (18 requirements, 38 design properties, 20 task sections) drove the build, with tasks that cite requirements and property tests that cite design properties. Five steering files fix the stack, structure, MVP scope, visual design and product tone, and `tests/repo-guard.test.ts` turns some of those rules into a failing test. The Neon MCP tools were used for read-only checks of production during the live smoke test (recorded in `docs/decisions.md`). Hooks are defined in `.kiro/hooks/`, but `docs/kiro-usage.md` lists known gaps in them. The full account is in [`docs/kiro-usage.md`](kiro-usage.md).

## Challenges

- **Missing identifiers.** The FAA feed does not always give a stable ID for a ground stop. We derive an event ID with fallbacks so the same stop is not alerted twice, and property tests cover the derivation.
- **No duplicate emails.** Poll retries, overlapping runs and email retries all had to be safe. We combined a poller lease, a unique key on events, a unique key on the alert log, and the Resend idempotency key.
- **Honest stale data.** The app must keep working when the FAA does not, without presenting old data as fresh. Staleness is computed on the server from the capture time, and alerts are gated on it.
- **Accessibility under a visual redesign.** The design system was added after the tests existed. The rule was to restyle with CSS and keep the tested DOM structure.

## Accomplishments

- A deployed, working pipeline: cron poll, stored snapshots, live dashboard, and real email through our own verified domain.
- 44 property-based test files over the core logic, plus unit, component and accessibility tests.
- Sign-in, alerts and unsubscribe with no passwords stored anywhere.

## What we learned

- Writing the correctness properties first made the detector and the de-duplication logic much easier to get right than example tests alone.
- Keeping pure logic apart from I/O meant most of the system could be tested with no mocks.
- A stale-data state needs its own design, not an afterthought.

## What's next

- Support ground delay programs, which the current version does not report.
- Everything stays within the MVP limits: 20 airports, a 10-airport watchlist, 24-hour history, email only.

## Built with

TypeScript (strict), Cloudflare Workers, Neon Postgres, Drizzle ORM, Zod, React 18, Vite, Vercel, Resend, Vitest, fast-check, vitest-axe, GitHub Actions, Kiro.

## Try it

- App: https://www.aerobriefs.com
- Source: https://github.com/vamegah/aero-brief
- Demo video: _add the public YouTube URL after task 14.4_

## Judge testing notes (PRIVATE Devpost field only)

- Open https://www.aerobriefs.com/sign-in and enter any email address you own. Use the `www` address, because the API only accepts sign-in requests from that origin.
- Open the emailed magic link within 15 minutes. It works once. The email comes from `alerts@aerobriefs.com`.
- Go to https://www.aerobriefs.com/watchlist and add airports (up to 10).
- No password and no test account is needed.
- Alert emails are sent only when the real FAA feed shows a ground stop starting or ending at a watched airport. An alert may not arrive during judging. The demo video shows one.
- The stale-data banner appears only when the poller has fallen 10 minutes behind, so it will normally not be visible. The way we showed it is in `docs/demo-script.md` ("Stale banner"): override the `/api/status/national` response in browser DevTools so it returns `"stale": true`. This changes only your own browser.
- To remove your data, use the "Delete account" button on /watchlist.

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
