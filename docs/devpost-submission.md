# AeroBrief: Devpost submission copy (Task 14.7)

Copy each section into the matching Devpost field. The "Judge testing notes" section goes only in the private field. The checklist at the end is for the team and is not submitted.

## Category

**Frankenstein.** AeroBrief stitches a government aviation feed, a Vercel relay, Cloudflare Workers cron jobs, serverless Postgres, a property-tested pure TypeScript core, email-as-login, and an accessibility-tested React app into one crisis tool that keeps answering when the FAA's own page does not.

## Project name and tagline

**AeroBrief.** Why your airport is disrupted, in plain language, even when the FAA page is down.

## Inspiration

On November 13, 2026, a nationwide ground stop halted U.S. flights. The FAA's public status page went down. Airline apps said "delayed" and gave no reason. Travelers and logistics dispatchers had no independent place to learn what was happening or why.

AeroBrief is that place. It is an independent monitor of the FAA NAS Status API. It does not depend on the FAA's public page, and it explains each event in plain language instead of FAA codes.

## What it does

The submission is `main` as of the deadline, December 4, 2026, 2:00 PM PT. The app is at https://www.aerobriefs.com. The list below describes the live product. All four Phase 2 features are on in production with Safe_Send_Mode on (verified by the owner on 2026-11-25; see "Phase 2 features, live in production").

- **Airport status page.** The page is titled "Airport status", with the subtitle "Ground stops and system-wide disruptions at 30 major US airports." A section menu switches between Overview, Events and Airports.
- **Overview.** A summary card gives a headline such as "All 30 airports operating normally" or "2 of 30 airports affected", two chips ("Ground stops" and "Recovering") with counts, and the named affected airports with the time since they changed and an estimate. Below it are the five latest events and a "View all events" link. When data is stale, the headline reads "Status is outdated. Showing the last known status of 30 airports" and never claims all is normal.
- **Freshness chip.** A chip in the page header reads Live, Delayed or Unavailable, with an "Updated" time. Delayed means the last known data stays on screen after a failed refresh. Unavailable means no status has ever loaded. The text carries the state and the color only repeats it.
- **Incident cards.** The Events section shows one card per incident, with the start and the end of a ground stop together. "Show details" opens a timeline and five labeled fields: What's happening, Why, Likely impact, Next update and Source. The cause is written in plain language, not as an FAA code. Filters by airport, type and state narrow the list, and a line says "Showing N of M incidents".
- **Airports table.** The Airports section has an "All (30)" and "Affected (N)" filter, a search box (placeholder "Code or city, e.g. LAS or Las Vegas") and a count line, "Showing N of 30 airports". Airports with no disruption show an "Operating normally" pill. Filters and search live in the URL, so a link keeps them. Ground stop airports come first, then the rest by code. A stopped airport's row shows the reason, "Expected to end around <time> UTC" or "Until further notice", and a link to the FAA advisory. Only `https://` links on `faa.gov` are shown; otherwise the link goes to the FAA status page.
- **Airport page.** Each airport code links to `/airport/<code>`, which shows that airport's current status, its details, the last-updated time and its events from the last 24 hours.
- **System-wide banner.** When ground stops affect three or more FAA centers (ARTCCs) at once, the page shows a "System-wide disruption" banner with an explanation.
- **Stale-data banner and cached fallback.** If the latest stored data is more than 10 minutes old, the page says so and shows the last update time. The page is served from our database, not from the FAA at request time. If a refresh fails, the page keeps the last data and shows an error message instead of going blank.
- **Time display.** In Settings, "Time display" offers Relative, Airport local time, My local time and UTC. Times shown in the app follow the choice, and the exact time is in a tooltip.
- **Watchlist without an account.** A signed-out visitor can follow airports with "Quick add" buttons (ATL, DFW, LAS) or search, up to 30. The list is stored in the browser and the page shows "N of 30 airports watched". The daily digest and email alerts need an account.
- **Passwordless sign-in and merge.** Enter an email, get a one-time magic link that expires in 15 minutes and works once. There are no passwords. After sign-in, a banner offers "Add to my account" for the airports saved in the browser. A 31st airport is refused with a message that an account holds 30 airports at most.
- **Settings.** `/settings` has a section menu in this order: Daily digest, Webhooks, Display and Account. Display and Account always appear. Daily digest and Webhooks need a session; a signed-out visitor sees a lock that says "Sign in to manage your settings."
- **Navigation and footer.** The nav bar (Status, Watchlist, Settings, Sign in) collapses behind a "Menu" button on a phone. Settings is always a top-level link. Once signed in, "Sign in" is replaced by an "Account" menu that holds Sign out. The footer links the API documentation and the FAA NAS Status data source, and says "Information is advisory and not for operational flight decisions."
- **Email alerts and unsubscribe.** Sent when a ground stop starts or ends at a watched airport, and for nationwide events. Alerts pause while data is stale. Each ground stop alert carries a signed one-click unsubscribe link.

## Phase 2 features, live in production

Git tag `mvp-contest-2026` marks the MVP restore point. Four additions were built after it on the `phase-2` branch, each behind its own feature flag. All four flags are on in production (verified by the owner on 2026-11-25), and `main` as of the deadline includes them:

- **Dark mode** (`FEATURE_DARK_MODE`).
- **High-contrast AAA theme** (`FEATURE_HIGH_CONTRAST`).
- **Signed webhooks** (`FEATURE_WEBHOOKS`): outbound, signed, retried deliveries of ground stop events.
- **Daily digest email** (`FEATURE_DIGESTS`).

Webhooks and the digest need migrations 0004 and 0005. Migrations 0004 to 0006 are applied to the production database, each after a Neon restore-point branch (`docs/kiro-usage.md`, "Phase 2: features behind flags"; procedure in `docs/phase2-rollout.md`). Safe_Send_Mode is on: digests and webhooks go only to allowlisted recipients and hosts (`packages/core/src/safe-send.ts`), so this file does not claim that every user receives them. With every flag turned off, the code behaves as the MVP does, apart from the limits below. Nothing else from the Phase 2 plan is built.

The owner raised the limits on 2026-11-24 (`docs/decisions.md`): the app monitors the 30 FAA Core 30 airports (up from 20), a watchlist holds 30 airports (up from 10), and history stays at 24 hours. That change needs migration 0006 in the production database (`docs/production-runbook.md`, "Migration 0006"). The Poller reads old 20-airport snapshots and completes them, so a deploy does not break on stored data.

The FAA blocks requests from Cloudflare Workers with HTTP 403. The Poller therefore asks one small Vercel Function (`apps/web/api/internal/faa-relay.ts`) to fetch the fixed FAA URL for it. The function does nothing else. The owner approved this single exception on 2026-11-22; `.kiro/steering/tech.md` records it, `docs/decisions.md` has the decision, and the steps are in `docs/production-runbook.md` ("FAA relay").

## How we built it

### Data source and the FAA relay

AeroBrief reads the FAA's public NAS Status airport-events feed (https://nasstatus.faa.gov/api/airport-events). This is public US government status information. AeroBrief is free and non-commercial. We do not claim FAA permission or endorsement.

The FAA's servers answer requests from Cloudflare Workers with HTTP 403 (probe evidence in `.kiro/specs/faa-403-poller/probe-result.md`). The Poller therefore asks one small Vercel Function to fetch that one fixed URL, once every 5 minutes, and nothing else. AeroBrief does not scrape any website. Billing and commercial use wait for a review of the FAA data terms (`.kiro/steering/scope.md`).

The stack is fixed and serverless:

- A **Cloudflare Worker** runs on a 5-minute cron. It fetches the FAA airport events feed through the relay, validates it with Zod, normalizes it to exactly 30 airports (the FAA Core 30), and stores a snapshot in **Neon Postgres** through **Drizzle ORM**. A second 30-minute cron deletes data older than 24 hours.
- A **pure TypeScript core** (`packages/core`) holds the change detector, explanation mapper, event keys, watchlist rules and unsubscribe signing. It has no I/O. **fast-check** property tests (85 `*.pbt.test.ts` files across the repo, counted on 2026-11-25) check it against the correctness properties in the design.
- A second **Worker** serves a hand-written JSON API for status, history, sign-in and watchlists.
- **Resend** sends magic links and alerts. A small shared client retries and sets an `Idempotency-Key` so a retried poll cannot email a user twice about the same event.
- **React 18 + Vite** on **Vercel** renders the dashboard. Colors are tokens, and a test checks every color pair against WCAG 2.1 AA contrast. A vitest-axe suite checks every page.

How Kiro was used: the Kiro IDE only, with built-in sub-agents (no custom agents) and no Kiro powers. Full account: [`docs/kiro-usage.md`](kiro-usage.md).

- **Specs.** The first spec (18 requirements, 38 design properties, 20 task sections) drove the MVP, with tasks that cite requirements and property tests that cite design properties. A second spec (`.kiro/specs/aerobrief-phase2/`, 21 design properties) drove the four flagged features. Five later specs followed: `faa-403-poller` (the FAA relay fix), `ui-refresh` (the Status and Settings redesign), `core30-limits` (the move to 30 airports and a 30-airport watchlist), `ui-improvements` (the Overview, incident cards, freshness chip, signed-out Watchlist, navigation and footer; every criterion marked build now, deferred or out of scope) and `submission-polish` (the hooks and these documents).
- **Steering.** Five steering files fix the stack, structure, MVP scope, visual design and product tone. `tests/repo-guard.test.ts` turns some of those rules into a failing test. The scope file's Phase 2 section requires a flag per feature and a rollback rule.
- **Hooks.** Two agent hooks are defined in `.kiro/hooks/`: a typecheck and test run after the agent saves a file, and a test reminder before a write under `packages/core/src/`. Both are prompts and neither blocks a write. `docs/hooks.md` describes them, their limits and the firing record. The first versions were broken and were replaced by the `submission-polish` spec.
- **Neon MCP.** The Neon MCP tools made read-only checks of production during the live smoke test, ran migrations 0004 and 0005 on a copy-on-write `phase-2` branch, and applied migrations 0004 to 0006 to production after restore-point branches (`docs/decisions.md`, `docs/phase2-rollout.md`).
- **Property tests.** One property test caught a real bug: the digest unsubscribe signature check accepted more than one string for the same signature.

## Where Kiro surprised us

Four of the six cases in `docs/kiro-usage.md`, each with its evidence in the repository.

- **A property found a second string for one signature.** Property 10 of the Phase 2 spec says a digest unsubscribe signature verifies for exactly one string. The test produced a counterexample because `atob` ignores the unused trailing bits of the last base64url character, so two strings decoded to the same bytes. Commit `bbd419e` made the decoder accept only the canonical encoding and kept the counterexample as a regression test.
- **The FAA answered Cloudflare with HTTP 403, and a probe settled it.** We first suspected missing headers. A throwaway Worker called the FAA three ways from Cloudflare on 2026-11-21 and got 403 each time, while the same URL returned 200 from the owner's machine and from a Vercel Preview. That led to the single approved relay function (`.kiro/specs/faa-403-poller/probe-result.md`, `docs/decisions.md` 2026-11-22).
- **A sub-agent reported a task finished when it was not.** The sub-agent for task 17.4 said the event card styles were done, but the CSS had not been written. The orchestrator found the gap by checking the deployed stylesheet, and commit `a690842` added the 61 missing lines.
- **A CSS rule lost a specificity contest on a phone.** Clipped Add and Remove buttons in the stacked table layout came from a wide-screen `width: 1%` rule with higher specificity than the reset in the narrow block. Commit `5f19226` fixed it with a regression test in `apps/web/test/layout-css.test.ts`.

Two more are in the write-up: a thrown value that could break the error reporter in `fetchFaa` (commit `3527e43`), and a frontend that was ahead of the API by one field (`incidentKey`, commit `9074304`).

## Challenges

- **Missing identifiers.** The FAA feed does not always give a stable ID for a ground stop. We derive an event ID with fallbacks so the same stop is not alerted twice, and property tests cover the derivation.
- **No duplicate emails.** Poll retries, overlapping runs and email retries all had to be safe. We combined a poller lease, a unique key on events, a unique key on the alert log, and the Resend idempotency key.
- **Honest stale data.** The app must keep working when the FAA does not, without presenting old data as fresh. Staleness is computed on the server from the capture time, alerts are gated on it, and the freshness chip and headline say so.
- **Accessibility under a visual redesign.** The design system was added after the tests existed. The rule was to restyle with CSS and keep the tested DOM structure.

## Accomplishments

- A deployed, working pipeline: cron poll through a relay, stored snapshots, live dashboard, and real email through our own verified domain.
- 85 property-based test files over the core logic, plus unit, component and accessibility tests.
- Sign-in, alerts and unsubscribe with no passwords stored anywhere.

## What we learned

- Writing the correctness properties first made the detector and the de-duplication logic much easier to get right than example tests alone.
- Keeping pure logic apart from I/O meant most of the system could be tested with no mocks.
- A stale-data state needs its own design, not an afterthought.
- A sub-agent's "done" needs a check against the real output.

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
- Demo video: https://youtu.be/zM7OS0r_CiI

## Testing instructions for judges (paste into the PRIVATE Devpost testing field)

```text
Live app: https://www.aerobriefs.com

NO LOGIN NEEDED for:
- Status: Overview, Events and Airports (open https://www.aerobriefs.com).
- Watchlist while signed out (https://www.aerobriefs.com/watchlist). Use "Quick add" or search. The list is stored in your browser, up to 30 airports.
- Settings, then Display (time display, theme).

TO SIGN IN: choose "Sign in" (https://www.aerobriefs.com/sign-in, use the www address), enter any email address you own, then open the magic link we email you. Check your spam folder. The link expires in 15 minutes and works once. There are no passwords and no test account.

SIGNED-IN FEATURES: Watchlist (up to 30 airports, "Add to my account" copies your browser list), Settings, then Daily digest, Webhooks, and Account (including "Delete account").

SAFE SEND MODE IS ON DURING JUDGING. Digest emails and webhook deliveries go only to allowlisted recipients and hosts, so your own address will not receive a digest and your webhook URL will not be called unless we add it. Contact us through Devpost with your email address or webhook host and we will add it.

DATA: the app updates every 5 minutes from the FAA's public NAS Status feed. When there are no ground stops, the dashboard shows "All 30 airports operating normally". Alert emails are sent only when a real ground stop starts or ends at a watched airport, so one may not arrive during judging.

STALE BANNER: it appears only when data is more than 10 minutes old. To see it, override the /api/status/national response in browser DevTools so it returns "stale": true (steps in the judge notes below). This changes only your own browser.

API documentation: https://github.com/vamegah/aero-brief/blob/main/docs/api.md
Source: https://github.com/vamegah/aero-brief
```

## Judge testing notes (PRIVATE Devpost field only)

Longer notes behind the block above.

- Open https://www.aerobriefs.com. The "Airport status" page opens on Overview. The chip in the header reads Live, Delayed or Unavailable and shows the update time. Open Events and choose "Show details" on an incident card to see the five fields.
- The watchlist works signed out, with no sign-in needed. Open https://www.aerobriefs.com/watchlist, use "Quick add" or search, and the list is stored in your browser (up to 30).
- To try sign-in, open https://www.aerobriefs.com/sign-in and enter any email address you own. Use the `www` address, because the API only accepts sign-in requests from that origin. After sign-in, choose "Add to my account" to copy the browser list to your account.
- Open the emailed magic link within 15 minutes. It works once. The email comes from `alerts@aerobriefs.com`.
- Open Settings, then "Display", to change "Time display" (Relative, Airport local time, My local time, UTC). Times shown in the app follow it.
- No password and no test account is needed.
- Alert emails are sent only when the real FAA feed shows a ground stop starting or ending at a watched airport. An alert may not arrive during judging.
- The stale-data banner appears only when the poller has fallen 10 minutes behind, so it will normally not be visible. The way we showed it is in `docs/demo-script.md` ("Stale banner"): override the `/api/status/national` response in browser DevTools so it returns `"stale": true`. This changes only your own browser.
- To remove your data, open Settings, the "Account" section, and use "Delete account" (`apps/web/src/components/AccountSection.tsx`).
- Digests and webhooks are limited by Safe_Send_Mode to allowlisted recipients, so a judge's address will not receive a digest, and webhooks go only to allowlisted hosts.

## Submission checklist (team use, not submitted)

- [ ] Category selected: Frankenstein
- [ ] GitHub repo public, `.kiro/` at the root and not ignored, MIT license visible in About (task 14.5)
- [ ] Working URL: https://www.aerobriefs.com
- [ ] Text description pasted from this file
- [x] Public YouTube demo under 3 minutes: https://youtu.be/zM7OS0r_CiI (2:57, public)
- [x] Kiro write-up: `docs/kiro-usage.md` updated again for the Kiroween questions (task 14.8)
- [ ] Optional, Social Blitz: post with `#KiroweenHackathon26` at the start (task 15.2)
- [ ] Optional, Bonus Blog: public post mentioning Kiroween 2026 (task 15.1)
- [ ] Submit before the deadline: Dec 4, 2026, 2:00 PM PT
