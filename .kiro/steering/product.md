---
inclusion: manual
---
<!------------------------------------------------------------------------------------
   This file is included only when invoked as a slash command (`/<filename>`)
   in chat. Use it for prompts and instructions you want to run on demand —
   the manual replacement for user-triggered hooks.

   Learn about inclusion modes: https://kiro.dev/docs/steering/#inclusion-modes
-------------------------------------------------------------------------------------> 
# Product: AeroBrief

## What It Is
An independent FAA airport disruption monitor. It polls the FAA NAS Status API, detects ground stops and delays, and tells users *why* their airport is disrupted — in plain language, by email, and on a web dashboard.

## The Problem
On November 13, 2026, a nationwide ground stop halted U.S. flights. The FAA's public status page went down. Airline apps said "delayed" with no explanation. Travelers and logistics dispatchers had no independent channel to learn what was happening or why.

## Target Users
- Frequent flyers who need to know whether their airport is operating normally
- Airline operations and dispatch teams
- Logistics and cargo dispatchers
- Corporate travel managers

## Core Value Proposition
1. **Independent** — stays up when FAA public systems fail
2. **Explanatory** — translates raw FAA event codes into plain language
3. **Proactive** — email alerts on state changes, not passive lookup
4. **Resilient** — serves cached data with a visible stale banner during outages

## What Success Looks Like
At least one documented case where AeroBrief provided information during an FAA outage that official channels did not.

## Scope Boundaries
See `scope.md` for the enforced MVP boundaries. Product-level summary: 20 hardcoded U.S. airports, email-only alerts, 24-hour history, no accounts with passwords, no monetization.

## Tone and Content Rules
- User-facing copy must be plain language, never raw FAA codes (e.g. show "storms at your airport, expect ~40 min delays," not "GDP due to VOL")
- Every displayed status must carry a last-updated timestamp
- Never show a blank or error-only screen — always fall back to cached data with a banner 