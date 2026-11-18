# AeroBrief demo video script (Task 14.4)

Target length: 2:45 (hard limit 3:00). About 350 spoken words at a calm pace. You record and upload. Nothing in this file is automated.

Live URLs:

- Web: https://www.aerobriefs.com (use `www`; the API only accepts writes from this exact origin)
- Sign-in: https://www.aerobriefs.com/sign-in
- Watchlist: https://www.aerobriefs.com/watchlist
- API (not shown on screen except optionally in one shot): https://aerobrief-api.vamegah.workers.dev/api/health
- Status JSON (used for the stale banner setup): https://www.aerobriefs.com/api/status/national

## Shot list

| # | Time | Screen | Narration |
|---|------|--------|-----------|
| 1 | 0:00-0:12 | Dashboard at https://www.aerobriefs.com, signed out, page top. | "This is AeroBrief. It tells you in plain language when the FAA stops flights to a major US airport, and emails you the moment it happens." |
| 2 | 0:12-0:35 | Same page. Slowly scroll the airport table (20 rows), then the "Events in the last 24 hours" list. Point at the "Data captured ... UTC" line. | "The dashboard watches twenty major US airports. A Cloudflare Worker polls the FAA feed every five minutes and stores a snapshot. Each row shows whether an airport has a ground stop and why. Below that, events from the last twenty-four hours, with a plain-English explanation." |
| 3 | 0:35-0:58 | Click or go to /sign-in. Type your demo email. Click "Email me a sign-in link". Show the confirmation text ("a sign-in link is on its way... expires in 15 minutes and works once"). | "There are no passwords. You enter your email and get a one-time magic link. It expires in fifteen minutes and works once." |
| 4 | 0:58-1:20 | Switch to the inbox. Show the new email: From "AeroBrief <alerts@aerobriefs.com>", subject "Your AeroBrief sign-in link". Open it, click the link (keep the token part of the URL off screen). | "The email comes from our own verified domain, alerts at aerobriefs dot com, sent through Resend. One click and I'm signed in." |
| 5 | 1:20-1:42 | Lands signed in. Go to /watchlist. Add two airports (for example ATL and JFK). Show "Watching 2 airports." | "On my watchlist I pick the airports I care about. The limit is ten. When a ground stop starts or ends at one of them, I get an email." |
| 6 | 1:42-2:08 | Inbox: an alert email, for example subject "Ground stop ended: ATL". Show the explanation text and the Unsubscribe link. See "Alert email" below for how to get one. | "This is what an alert looks like: the airport, what changed, a plain-language explanation, the time in UTC, and a one-click unsubscribe." |
| 7 | 2:08-2:35 | Back to https://www.aerobriefs.com (reload). The yellow "Data may be out of date" banner is visible. Point at it and at the "Last updated" time. See "Stale banner" below. | "If the poller ever falls behind by more than ten minutes, we don't pretend the data is fresh. The dashboard shows this warning with the last update time, and the alert emails pause until fresh data returns." |
| 8 | 2:35-2:45 | Return to the dashboard top. | "AeroBrief: FAA ground stops in plain language, built on Cloudflare Workers, Neon, Resend and Vercel, and built with Kiro specs. Thanks for watching." |

Total: 2:45. If you run long, drop shot 5's second airport or shorten shot 2.

## Stale banner: how it works and how to show it safely

How the app decides (verified in code):

- The API computes `stale` in `apps/api/src/handlers/status.ts` using `isStale(capturedAt, now)` from `packages/core/src/time.ts`. A snapshot is stale when it is more than 600,000 ms (10 minutes) old.
- The web app only renders the banner when the `/api/status/national` response has `state: "ok"` and `stale: true` (`apps/web/src/components/StatusView.tsx`, `StaleDataBanner.tsx`). There is no dev flag, query parameter or preview mode that forces it.
- The poller runs every 5 minutes, so real stale data only appears if polling fails for 10+ minutes. Do not wait for that.

### Recommended: edit the response in your browser (production is not touched)

This changes only what your own browser receives. It does not modify the database, the Worker or the cron. It needs no tools beyond Chrome or Edge DevTools. Because the banner is genuinely rendered by the production site from a `stale: true` payload, say so honestly in narration if asked ("simulated stale state").

Setup, before you start recording:

1. Open https://www.aerobriefs.com in Chrome or Edge. Press F12.
2. Open the Network tab, reload, and find the request `national` (URL `/api/status/national`).
3. Right-click it, choose "Override content". If asked, pick an empty local folder (for example `C:\temp\overrides`) and click Allow. This folder must be outside the repo.
4. In the Sources tab, the response opens as an editable file. Change `"stale":false` to `"stale":true`. For a believable banner, also change `capturedAt` to a time about 30 minutes in the past (same ISO format as the existing value). Save with Ctrl+S.
5. Reload the page. The banner "Data may be out of date. Last updated ..." should appear. Note the page re-fetches every 60 seconds and keeps using the override.
6. Turn the override off for the other shots: DevTools, Sources, Overrides, uncheck "Enable Local Overrides". Turn it back on for shot 7.

Recording plan: record shots 1-6 with overrides disabled. Enable overrides, record shot 7, then stop. You can also record shot 7 as a separate clip and join it in editing.

### Other options (not recommended)

- Local run against a stale fixture: `apps/web/vite.config.ts` proxies `/api` to `http://localhost:8787` (a local `wrangler dev` of `apps/api`). That needs a local `.dev.vars` and a stale snapshot in a database, which means either touching production data or setting up a separate Neon branch. More work than the DevTools override and no more convincing on camera.
- Wait for real stale data: unpredictable, not usable.
- **Needs your explicit approval, do not do by default:** pausing the production poller cron or editing a production `snapshots` row so the real API returns `stale: true`. This makes the live site, and alert sending, actually stale for real users until you reverse it. I have not done it and do not recommend it.

## Alert email: how to show one

An alert email is only sent when a ground stop starts or ends at an airport on someone's watchlist (`apps/poller/src/notifier.ts`, `packages/core/src/alert-email.ts`). Subjects look like "Ground stop started: ATL", "Ground stop ended: ATL" or "Nationwide event". Options, in order of preference:

1. **Use an alert email you already have.** If you ran the 13.3 smoke test (Path B in `docs/production-runbook.md`) or received any real alert, open that email from the inbox for shot 6. Check that no secrets or token links are visible. This needs no new action.
2. **Wait for a real event.** Real ground stops start and end fairly often at big airports. If you add a busy airport (for example EWR, JFK, ATL) on the watchlist a few hours before recording, a real alert may arrive. Check the FAA/dashboard events list for one.
3. **Needs your explicit approval:** the controlled test in `docs/production-runbook.md` section 13.3 step 5, Path B. It writes one synthetic ground stop into the newest production snapshot with SQL in the Neon editor, so the live dashboard shows a fake ground stop for up to 5 minutes and one fake event is stored for 24 hours. It sends a real email to every user watching that airport. Only run it if you accept that and the airport has no other watchers. I did not run it.
4. If none of these is possible, cut shot 6 and extend shot 5 by 20 seconds. Do not fake an alert with a mock-up.

## Pre-recording checklist

- [ ] Recording tool ready: OBS Studio (Scene: Display Capture or Window Capture, 1920x1080, 30 fps, MP4 or MKV) or Windows Game Bar (Win+G, then Record; it captures one app window, so it cannot switch between browser and mail app unless both are in one browser, so open the webmail in a browser tab).
- [ ] Microphone checked: record 10 seconds and play it back. Quiet room, notifications silenced (Windows Focus Assist on).
- [ ] Browser: a clean profile or a window with no personal bookmarks or extensions visible. Zoom at 125 percent so text is readable on a phone. Window maximised.
- [ ] Signed out of AeroBrief. Open DevTools, Application, Cookies, delete any session cookie for www.aerobriefs.com, or use a private window (private windows do not keep DevTools overrides across sessions, so use a normal window for shot 7).
- [ ] Use an email address you control with an empty-looking inbox. Open the webmail in a second tab. Delete clutter. Make sure the sign-in email arrives within a few seconds by sending one test sign-in first (the link is single-use, so request a new one while recording).
- [ ] The test account has no leftover watchlist airports (so shot 5 starts from "Watching 0 airports"), or accept starting from existing ones.
- [ ] Stale override prepared and disabled (see above).
- [ ] Close or hide: `.env` files, terminals showing keys, Resend/Neon/Cloudflare dashboards, password manager.
- [ ] Dry run the whole script once with a stopwatch. Aim for 2:30 to 2:50.
- [ ] After recording, delete the watchlist entries or the account (Delete account button on /watchlist) if you do not want the demo address to receive alerts.

## YouTube upload notes

- Visibility: **Unlisted** is enough for Devpost judges and keeps it off search. Choose Public only if you want it discoverable. Do not leave it Private; judges cannot open it. Confirm the link works in a logged-out window.
- Audience: "No, it's not made for kids".
- Title: `AeroBrief demo: FAA ground stop alerts in plain language (under 3 minutes)`
- Description (adapt):

```
AeroBrief monitors FAA ground stops at 20 major US airports and emails you in plain language when one starts or ends at an airport on your watchlist.

Live app: https://www.aerobriefs.com
Source: <your GitHub repo URL>

Built with Cloudflare Workers, Neon Postgres + Drizzle, React + Vite on Vercel, and Resend, using Kiro specs.

In this demo: the live dashboard, passwordless magic-link sign-in, the watchlist, an alert email, and the stale-data banner (shown with a simulated stale response).

Chapters
0:00 Dashboard
0:35 Sign in with a magic link
1:20 Watchlist
1:42 Alert email
2:08 Stale-data banner
```

- Confirm the length is under 3:00 in YouTube Studio before submitting. Judges may stop watching at the limit.
- Add the final link to the Devpost submission (Task 14.5). Disclose in the description that the stale banner shot uses a simulated response, as above.

## What you must do

1. Decide how to get an alert email for shot 6 (options 1 to 4 above). Option 3 needs your explicit approval.
2. Prepare the DevTools override for shot 7 (no approval needed, production untouched).
3. Run the checklist, record, upload, and paste the video URL where Task 14.5 needs it.
