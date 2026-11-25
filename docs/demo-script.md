# AeroBrief demo video script

**First, check the maximum video length in the Devpost rules (https://kiroween.devpost.com/rules) before you record.** The rules text I read says the video must be uploaded to YouTube and made public, and that judges look for the project working end to end. It states no maximum length. The earlier version of this script said "under 3:00" and cited the rules, but I could not find that limit in the rules page text. Check the rules and the Devpost submission form. If neither gives a limit, this script targets 3:00 total. If a lower limit exists, cut shot 7 first, then shorten shot 4.

You record and upload. Nothing in this file is automated. About 400 spoken words at a calm pace fit in 3:00.

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

## Shot list (target 3:00)

| # | Time | Screen | Narration | Have open before recording | Fallback if the live step fails |
|---|------|--------|-----------|----------------------------|---------------------------------|
| 1 | 0:00-0:15 | Title card, or the live Status page at https://www.aerobriefs.com with the header "Airport status" in view. | "On November 13th a nationwide ground stop halted US flights. The FAA's status page went down. Airline apps said delayed, and never said why. AeroBrief is the independent channel." | Browser, signed out, tab on `/`. | Use a plain title card ("AeroBrief") with the narration. |
| 2 | 0:15-0:40 | Status, **Overview** section. Point at: the headline sentence, the two chips "Ground stops" and "Recovering", any affected airport with its status pill, the "Last updated ..." line, and the freshness chip in the page header ("Live", with "Updated ..."). | "The Overview says in one sentence what is happening across the thirty FAA Core 30 airports. Two counters: ground stops and recovering. The chip in the header says Live, with when the data was updated. If it falls behind it says Delayed. If it never loaded it says Unavailable." | Tab on `/#overview`. | If every airport is normal, the card shows "No events in the last 24 hours" or "Most recent event ..." instead of affected airports. Say so and move on. |
| 3 | 0:40-1:05 | **Events** section ("Events in the last 24 hours"). Click "Show details" on one incident card. Point at the five fields: "What's happening", "Why", "Likely impact", "Next update", "Source", and the "Timeline" with "Started" and "Ended". | "Each incident is one card, Active or Ended. Open it and you get five plain-language fields: what's happening, why, the likely impact, when the next update is due, and the source. Not raw FAA codes." | Tab on `/#events`. At least one event in the list. | If "No events in the last 24 hours" shows, use a recorded clip from an earlier day. Do not fake an incident. |
| 4 | 1:05-1:20 | **Airports** section. Type `Las Vegas` in "Search airports". Point at "Showing 1 of 30 airports". Click "Affected" then "All" if time allows. | "Search by code or city. The count is announced, so it works with a screen reader." | Tab on `/#airports`. Search box empty. | Type `LAS` instead. |
| 5 | 1:20-1:50 | Go to `/watchlist` signed out. Header "Your watchlist", counter "0 of 30 airports watched". Click the quick-add chips for ATL and LAS (the button text is the code). Point at "Your list stays in this browser." Click "Sign in". On `/sign-in`, enter the allowlisted address, click "Email me a sign-in link", point at "Check your inbox" and "It expires in 15 minutes and works once". Switch to the inbox, open "Your AeroBrief sign-in link" (keep the token off screen), click the link. On `/watchlist`, the banner "You saved 2 airports in this browser. Add them to your account?" shows. Click "Add to my account". | "No account is needed to build a watchlist. It lives in your browser. To get email alerts, sign in with a one-time link: no passwords. On sign-in, AeroBrief offers to move the list to your account. Up to thirty airports." | Browser local storage empty for the site (use a fresh window). Webmail open in a second tab. Allowlisted address ready. | If the email is slow, cut after "Check your inbox" and join a pre-recorded clip of the click-through. |
| 6 | 1:50-2:15 | **Settings** (open from the "Account" menu, then "Settings"). Show **Display**: the "Time display" group, pick "UTC", then "Relative (for example, 25 min ago)". Show **Daily digest**: checkbox "Send me a daily digest", "Send at (UTC)", button "Save digest settings". Show **Webhooks**: click "Send test event" on your allowlisted webhook, point at the result "Test event to <host>: delivered (HTTP 200)". | "Settings: choose how times are shown. Turn on a daily digest. Add up to three signed webhooks, and send a test event to check them." | Signed in as the allowlisted address. One webhook already added (a receiver you control, host on the allowlist). Do not show its signing secret. | If the test event fails, show the display and digest parts only, and say webhooks are signed and limited to allowlisted hosts. Do not claim a delivery you did not see. |
| 7 | 2:15-2:25 | Phone-width window (narrow the browser under 768 px, or use DevTools device mode). Point at the "Menu" button and the stacked tables. | "It works on a phone: collapsed menu, stacked tables." | A second narrow window ready. | Skip this shot. |
| 8 | 2:25-2:50 | The Kiro story. (a) File tree: `.kiro/specs/` list. (b) `.kiro/steering/` (`tech.md`, `scope.md`, `structure.md`, `design.md`, `product.md`). (c) Agent Hooks panel with a hook firing (see `docs/hooks.md`, "How to see each hook fire"). (d) The Neon MCP server in the Kiro MCP panel. (e) A property test run: `npx vitest --run packages/core/test/digest-unsubscribe.pbt.test.ts`. (f) One or two items from "Where Kiro surprised us" in `docs/kiro-usage.md`. | "Built with Kiro. Specs drove every feature. Steering files fixed the stack and the scope, and refused out-of-scope work. A hook typechecks and tests what the agent saves. Neon's MCP server applied our migrations on a branch first. Property tests caught real bugs: an unsubscribe signature that accepted a non-canonical encoding, and a fetch function that threw on an unusual error object." | Kiro window with the file tree open. Terminal with the test command ready. Hook-firing screenshots from task 6 of `.kiro/specs/submission-polish/tasks.md`, taken before you record. | Show the screenshots. If a hook did not fire in your Kiro version (see the "Firing record" in `docs/hooks.md`), do not show or claim a firing: show the hook files and say they are defined. |
| 9 | 2:50-3:00 | Back to the live Status page. | "AeroBrief: FAA ground stops in plain language, on Cloudflare Workers, Neon, Resend and Vercel, built with Kiro. aerobriefs.com. Thanks for watching." | Tab on `/`. | None. |

Total: 3:00. Trim shot 7 first, then shot 4.

Narration notes:

- Do not read FAA codes aloud. The product's rule is plain language.
- For shot 8, use at most two "surprises" and keep each to one sentence. Details and evidence are in `docs/kiro-usage.md`. Check the narration against that file once it is final.

## Stale banner and freshness chip: how it works and how to show it safely

How the app decides (verified in code):

- The API computes `stale` in `apps/api/src/handlers/status.ts` using `isStale(capturedAt, now)` from `packages/core/src/time.ts`. A snapshot is stale when it is more than 600,000 ms (10 minutes) old.
- The web app renders the "Data may be out of date." banner (`apps/web/src/components/StaleDataBanner.tsx`) when the `/api/status/national` response has `state: "ok"` and `stale: true` (`StatusView.tsx`). The freshness chip in the page header comes from `deriveFreshness({ hasData, stale, refreshFailed })` (`apps/web/src/pages/StatusPage.tsx`). Confirm on the live site while recording that `stale: true` makes the chip read "Delayed". I have not run it against production.
- There is no dev flag, query parameter or preview mode that forces the banner.
- The poller runs every 5 minutes, so real stale data only appears if polling fails for 10+ minutes. Do not wait for that.

Where to fit it: the shot list has no separate stale shot. If time allows, add 10 seconds to shot 2 (point at the chip reading "Delayed" and at the banner "Data may be out of date. Last updated ..."), or record it as a separate clip and join it in editing. Say honestly that the state is simulated.

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

- [ ] Devpost rules checked for the maximum video length (first line of this file).
- [ ] Recording tool ready: OBS Studio (Display Capture or Window Capture, 1920x1080, 30 fps) or Windows Game Bar (Win+G, then Record; it captures one app window, so open the webmail in a browser tab).
- [ ] Microphone checked: record 10 seconds and play it back. Quiet room, notifications silenced (Windows Focus Assist on).
- [ ] Browser: a window with no personal bookmarks or extensions visible. Zoom at 125 percent. Window maximised.
- [ ] Signed out of AeroBrief and the site's local storage cleared (DevTools, Application, Storage, "Clear site data"), so shot 5 starts at "0 of 30 airports watched". Use a normal window, not private, for the stale clip.
- [ ] The sign-in address is on `SAFE_SEND_ALLOWLIST_EMAILS`. The webhook host is on `SAFE_SEND_ALLOWLIST_HOSTS`. Send one test sign-in first to check the email arrives in seconds (the link is single-use, so request a new one while recording).
- [ ] The account has the digest and one webhook set up before shot 6, so the shot shows existing state. No signing secret on screen.
- [ ] Stale override prepared and disabled.
- [ ] Kiro window ready for shot 8: file tree, `.kiro/specs/`, `.kiro/steering/`, Agent Hooks panel, MCP panel, terminal with the test command. Hook-firing screenshots taken (task 6 of the submission-polish spec).
- [ ] Close or hide: `.env` files, terminals showing keys, Resend, Neon and Cloudflare dashboards, password manager.
- [ ] Dry run the whole script once with a stopwatch. Aim for 2:50 to 3:00.
- [ ] After recording, delete the account (Settings, "Account", "Delete account", then "Confirm delete account") if you do not want the demo address to keep receiving mail.

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
0:15 Overview and freshness
0:40 Incident cards
1:05 Airport search
1:20 Watchlist and sign-in
1:50 Settings
2:15 Phone layout
2:25 Built with Kiro
2:50 Wrap-up
```

- If you show the simulated stale state, say so in the description.
- Confirm the length in YouTube Studio against the Devpost limit before submitting.
- Add the final link to the Devpost submission (`docs/devpost-submission.md`).

## What you must do

1. Check the Devpost rules for the maximum length. Trim if needed.
2. Confirm the allowlisted email address and webhook host, and set up the digest and the webhook before recording.
3. Complete task 6 of the submission-polish spec (hook firing) and take the screenshots for shot 8.
4. Run the checklist, record, upload, and paste the video URL into the Devpost form.
