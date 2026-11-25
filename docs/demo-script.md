# AeroBrief demo video script

**Contest rules (verified by the owner from the official Kiroween 2026 rules, 2026-11-25):**

- The video "should be less than three (3) minutes. Judges are not required to watch beyond three minutes." This script targets 2:45 with a hard stop before 3:00.
- It must show the project functioning on the device it was built for (the desktop or laptop it was built on, not only a phone).
- It must be public on YouTube.
- It must not include third-party trademarks or copyrighted music or material without permission.

You record and upload. Nothing in this file is automated. The narration is about 270 spoken words, at a calm pace that fits 2:45 with room for pauses.
Live URLs:

- Web: https://www.aerobriefs.com (use `www`; the API only accepts writes from this exact origin)
- Status sections: `/#overview`, `/#events`, `/#airports`
- Sign-in: https://www.aerobriefs.com/sign-in
- Watchlist: https://www.aerobriefs.com/watchlist
- Settings: https://www.aerobriefs.com/settings (sections `#display`, `#digest`, `#webhooks`, `#account`)
- Status JSON (used for the stale-banner setup): https://www.aerobriefs.com/api/status/national

## Rules for the recording

- **Show only built features.** Everything below exists on the live site. Labels in quotes are copied from `apps/web/src`.
- **Do not show:** a map, an airport detail page (the `/airport/XXX` links in tables and cards: do not click them), delays or closures, Minor Impact or Disrupted statuses, Terms or Privacy pages (the footer has no such links). None of these is built or in scope (`.kiro/steering/scope.md`).
- **Safe_Send_Mode is on in production.** Digests and webhooks reach only allowlisted recipients. Sign in with an address on `SAFE_SEND_ALLOWLIST_EMAILS` for the digest shot. For the webhook shot, the webhook host must also be on `SAFE_SEND_ALLOWLIST_HOSTS`, or the test event reports "failed (not_allowlisted)" (`apps/api/src/handlers/webhooks.ts`). Check both lists before recording (`docs/phase2-rollout.md`). Never show the lists, a secret or a token on screen.
- **Nothing on screen may show `.env` files, API keys, a webhook signing secret you plan to keep, or a sign-in link token.**

## Shot list (target 2:45, hard stop before 3:00)

Record on the desktop or laptop the project was built on. Labels in quotes are copied from `apps/web/src` as of 2026-11-25.

| # | Time | Screen | Narration | Have open before recording | Fallback if the live step fails |
|---|------|--------|-----------|----------------------------|---------------------------------|
| 1 | 0:00-0:12 | The live Status page at https://www.aerobriefs.com, header "Airport status" in view. | "On November 13th a nationwide ground stop halted US flights and the FAA's status page went down. Airline apps said delayed, and never said why. AeroBrief is the independent channel." | Browser, signed out, tab on `/`. | Plain title card ("AeroBrief") with the narration. |
| 2 | 0:12-0:30 | Status, **Overview**. Point at the headline ("N of 30 airports affected", or "All 30 airports operating normally"), the chips "Ground stops" and "Recovering", the "Last updated ..." line, and the freshness chip in the page header ("Live", with "Updated ..."). | "The Overview says in one sentence how many of the thirty FAA Core 30 airports are affected, with counters for ground stops and recovering. The header chip says Live, and when the data was updated." | Tab on `/#overview`. | If all airports are normal, read the "All 30 airports operating normally" headline and move on. |
| 3 | 0:30-0:52 | **Events** ("Events in the last 24 hours"). Point at an incident card: the state pill (Active or Ended), the type, the airport code link and name (do not click it), and for an ended one "Ended <time> · lasted N min". Click "Show details". Point at the "Timeline" and the five fields "What's happening", "Why", "Likely impact", "Next update", "Source", then the link "View the FAA NAS Status site". | "Each incident is a card, Active or Ended, with how long it lasted. Open it for five plain-language fields: what's happening, why, likely impact, next update and source. No raw FAA codes." | Tab on `/#events`. At least one event, ideally one ended. | If "No events in the last 24 hours" shows, use a clip from an earlier day. Do not fake an incident. |
| 4 | 0:52-1:02 | **Airports**. Type `Las Vegas` into the search box (placeholder "Code or city, e.g. LAS or Las Vegas"). Point at "Showing 1 of 30 airports" and the "Operating normally" or "Recovering" pill. Click "Affected (N)" then "All (N)". | "Search by code or city, and filter to affected airports. Each row says operating normally or recovering." | Tab on `/#airports`. Search box empty. | Type `LAS`. |
| 5 | 1:02-1:25 | `/watchlist` signed out: "Your watchlist", "0 of 30 airports watched". Click the quick-add chips ATL and LAS. Click "Sign in". On `/sign-in`, enter the allowlisted address, click "Email me a sign-in link", point at "Check your inbox". Open the email "Your AeroBrief sign-in link" (token off screen), click the link. On `/watchlist`, click "Add to my account" on the banner "You saved 2 airports in this browser. Add them to your account?". Point at the status pill next to "Watching" for each airport. | "A watchlist needs no account. It lives in your browser. Sign in with a one-time email link, no passwords, and AeroBrief offers to move the list to your account. Signed in, each airport shows its live status." | Fresh window with empty local storage. Webmail in a second tab. Allowlisted address ready. | If the email is slow, cut after "Check your inbox" and join a pre-recorded click-through clip. |
| 6 | 1:25-1:48 | Top nav **Settings** (a top-level link; the "Account" menu holds only "Sign out"). **Display**: pick "UTC", then "Relative (for example, 25 min ago)", then point at the three theme swatches (System, Light, Dark). **Daily digest**: point at the send time in the form "01:00 UTC (7:00 PM your time)". **Webhooks**: point at the existing webhook's line "delivered 18 h ago"-style outcome, click "Send test event", point at "Test event to <host>: delivered (HTTP 200)". | "In Settings, choose how times and themes look. A daily digest shows its send time in your local time. Add signed webhooks and send a test event to check them." | Signed in as the allowlisted address. One webhook added (receiver you control, host on the allowlist). No signing secret on screen. | If the test event fails, show display and digest only, and do not claim a delivery you did not see. |
| 7 | 1:48-2:35 | The Kiro story, about 8 seconds each. (a) The two hooks firing: edit a comment in `packages/core/src/airports.ts` and show both hooks fire in the Kiro panel (`docs/hooks.md`, "Firing record"), or show the screenshot. (b) `.kiro/specs/` listing eight specs. (c) `.kiro/steering/`. (d) The Neon MCP server in the Kiro MCP panel. (e) One property test run: `npx vitest --run packages/core/test/digest-unsubscribe.pbt.test.ts`. (f) One surprise: the ORD stale-active bug caught from a phone screenshot and fixed with a live-data fixture test, or the probe that proved the FAA blocks Cloudflare (`docs/kiro-usage.md`). | "Built with Kiro. Eight specs drove the work. Steering files fixed the stack and the scope. Two hooks fired when I edited a file: one typechecks and tests, one checks that tests were updated. Neon's MCP server ran our migrations on a branch first. Here a property test runs. And one surprise: a phone screenshot showed Chicago O'Hare stuck as active. A live-data fixture test reproduced it, and we fixed it." | Kiro window with the file tree. Terminal with the test command typed but not run. Hook screenshots taken. | Show screenshots. Never claim a firing you did not see. |
| 8 | 2:35-2:45 | Back to the live Status page. | "AeroBrief: FAA ground stops in plain language, built with Kiro. aerobriefs.com. Thanks for watching." | Tab on `/`. | None. |

Total: 2:45. If the dry run exceeds 2:50, cut shot 4 first, then trim shot 7 to four items.

The phone-width shot was dropped to meet the 3:00 limit. The footer is two-column on desktop and needs no shot.

Narration notes:

- Do not read FAA codes aloud. The product's rule is plain language.
- Saying product names (Kiro, Neon) in narration is fine. Keep their logos and dashboards off screen (see the checklist).
- Shot 7 count of specs: eight folders in `.kiro/specs/` (aerobrief, aerobrief-phase2, core30-limits, faa-403-poller, submission-polish, ui-improvements, ui-refresh, ui-review-fixes). Recount before recording.
- The theme swatches appear only when the dark-mode flag is on in production. If Display shows no "Theme" group, skip that clause and edit the narration.
## Stale banner and freshness chip: how it works and how to show it safely

How the app decides (verified in code):

- The API computes `stale` in `apps/api/src/handlers/status.ts` using `isStale(capturedAt, now)` from `packages/core/src/time.ts`. A snapshot is stale when it is more than 600,000 ms (10 minutes) old.
- The web app renders the "Data may be out of date." banner (`apps/web/src/components/StaleDataBanner.tsx`) when the `/api/status/national` response has `state: "ok"` and `stale: true` (`StatusView.tsx`). The freshness chip in the page header comes from `deriveFreshness({ hasData, stale, refreshFailed })` (`apps/web/src/pages/StatusPage.tsx`). Confirm on the live site while recording that `stale: true` makes the chip read "Delayed". I have not run it against production.
- There is no dev flag, query parameter or preview mode that forces the banner.
- The poller runs every 5 minutes, so real stale data only appears if polling fails for 10+ minutes. Do not wait for that.

Where to fit it: the shot list has no separate stale shot. There is no room for it inside the 2:45 cut. Only add it by trimming another shot, and say honestly that the state is simulated.

### Recommended: edit the response in your browser (production is not touched)

This changes only what your own browser receives. It does not modify the database, the Worker or the cron.

1. Open https://www.aerobriefs.com in Chrome or Edge. Press F12.
2. Open the Network tab, reload, and find the request `national` (URL `/api/status/national`).
3. Right-click it, choose "Override content". If asked, pick an empty local folder outside the repo (for example `C:\temp\overrides`) and click Allow.
4. In the Sources tab, the response opens as an editable file. Change `"stale":false` to `"stale":true`. For a believable banner, also change `capturedAt` to a time about 30 minutes in the past (same ISO format as the existing value). Save with Ctrl+S.
5. Reload the page. The banner and the "Delayed" chip should appear. The page re-fetches every 60 seconds and keeps using the override.
6. Turn the override off for the other shots: DevTools, Sources, Overrides, uncheck "Enable Local Overrides". Turn it back on for the stale clip.

### Other options (not recommended)

- Local run against a stale fixture: `apps/web/vite.config.ts` proxies `/api` to `http://localhost:8787` (a local `wrangler dev` of `apps/api`). That needs a local `.dev.vars` and a stale snapshot in a database. More work than the DevTools override.
- Wait for real stale data: unpredictable.
- **Needs your explicit approval, do not do by default:** pausing the production poller cron or editing a production `snapshots` row. This makes the live site, and alert sending, stale for real users until you reverse it.

## Alert email: how to show one

The shot list does not need an alert email. If you want to add one (for example at the end of shot 5), note that an alert is sent only when a ground stop starts or ends at an airport on someone's watchlist (`apps/poller/src/notifier.ts`, `packages/core/src/alert-email.ts`). Subjects look like "Ground stop started: ATL", "Ground stop ended: ATL" or "Nationwide event". Options, in order of preference:

1. **Use an alert email you already have.** If you ran the 13.3 smoke test (Path B in `docs/production-runbook.md`) or received a real alert, open it. Check that no secret or token link is visible.
2. **Wait for a real event.** Add a busy airport (for example EWR, JFK, ATL) a few hours before recording.
3. **Needs your explicit approval:** the controlled test in `docs/production-runbook.md` section 13.3 step 5, Path B. It writes one synthetic ground stop into the newest production snapshot, so the live dashboard shows a fake ground stop for up to 5 minutes, and it sends a real email to every user watching that airport. I did not run it.
4. Otherwise leave the alert email out. Do not fake one with a mock-up.

## Pre-recording checklist

- [ ] Video under 3:00 (target 2:45). Judges need not watch past 3:00.\n- [ ] Recorded on the device the project was built on.\n- [ ] No third-party logos on screen: no Cloudflare, Neon, Vercel or Resend dashboards or pages. Close the webhook.site tab, or keep its logo out of frame. Check browser tabs, bookmarks and the Kiro MCP panel for logos.\n- [ ] No copyrighted music: record with none, or use only royalty-free music with a licence you can show. Saying product names in narration is fine.
- [ ] Recording tool ready: OBS Studio (Display Capture or Window Capture, 1920x1080, 30 fps) or Windows Game Bar (Win+G, then Record; it captures one app window, so open the webmail in a browser tab).
- [ ] Microphone checked: record 10 seconds and play it back. Quiet room, notifications silenced (Windows Focus Assist on).
- [ ] Browser: a window with no personal bookmarks or extensions visible. Zoom at 125 percent. Window maximised.
- [ ] Signed out of AeroBrief and the site's local storage cleared (DevTools, Application, Storage, "Clear site data"), so shot 5 starts at "0 of 30 airports watched". Use a normal window, not private, for the stale clip.
- [ ] The sign-in address is on `SAFE_SEND_ALLOWLIST_EMAILS`. The webhook host is on `SAFE_SEND_ALLOWLIST_HOSTS`. Send one test sign-in first to check the email arrives in seconds (the link is single-use, so request a new one while recording).
- [ ] The account has the digest and one webhook set up before shot 6, so the shot shows existing state. No signing secret on screen.
- [ ] Stale override prepared and disabled.
- [ ] Kiro window ready for shot 7: file tree, `.kiro/specs/`, `.kiro/steering/`, Agent Hooks panel, MCP panel, terminal with the test command. Both hooks fire on a comment edit to `packages/core/src/airports.ts` (or screenshots taken).
- [ ] Close or hide: `.env` files, terminals showing keys, Resend, Neon and Cloudflare dashboards, password manager.
- [ ] Dry run the whole script once with a stopwatch. Aim for 2:40 to 2:50.
- [ ] After recording, delete the account (Settings, Account section, "Delete account", then "Confirm delete account") if you do not want the demo address to keep receiving mail.

## YouTube upload notes

- Visibility: **Public**. The Kiroween 2026 rules require the video to be uploaded to YouTube and made publicly visible. Do not use Unlisted or Private. Confirm the link works in a logged-out window.
- Audience: "No, it's not made for kids".
- Title: `AeroBrief demo: FAA ground stops in plain language`
- Description (adapt):

```
AeroBrief monitors FAA ground stops at the 30 FAA Core 30 airports and explains them in plain language: a network overview, incident cards with what is happening, why and the likely impact, a watchlist that works without an account, and, for signed-in users, email alerts, a daily digest and signed webhooks.

Live app: https://www.aerobriefs.com
Source: <your GitHub repo URL>

Built with Cloudflare Workers, Neon Postgres + Drizzle, React + Vite on Vercel, and Resend, using Kiro specs, steering, hooks and the Neon MCP server.

Chapters
0:00 The problem
0:12 Overview and freshness
0:30 Incident cards
0:52 Airport search
1:02 Watchlist and sign-in
1:25 Settings
1:48 Built with Kiro
2:35 Wrap-up
```

- If you show the simulated stale state, say so in the description.
- Confirm in YouTube Studio that the length is under 3:00.
- Add the final link to the Devpost submission (`docs/devpost-submission.md`).

## What you must do

1. Dry run with a stopwatch and trim to under 3:00.
2. Confirm the allowlisted email address and webhook host, and set up the digest and the webhook before recording.
3. Take the hook-firing screenshots for shot 7 as a fallback.
4. Run the checklist, record, upload, and paste the video URL into the Devpost form.
