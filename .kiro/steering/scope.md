---
inclusion: always
---

# MVP Scope

These boundaries are fixed for the MVP.

## Limits

- AeroBrief monitors the FAA Core 30 airports (the 30 airports the FAA ASPM help pages mark "Core 30"). Source: https://www.aspm.faa.gov/aspmhelp/index/ASPM_77.html. The codes are in `packages/core/src/airports.ts`.
- A user watchlist is capped at 30 airports.
- History retention is 24 hours only.

The owner raised the airport count from 20 to 30 and the watchlist cap from 10 to 30 on 2026-11-24 ("Core 30, watchlist 30, keep the rest."). See `docs/decisions.md`.

## Prohibited

- Scraping FlightAware, Flightradar24, or any other third-party site.
- FAA SWIM integration in the MVP.
- Push notifications.
- Map view.
- Native mobile apps.
- User passwords.
- Monetization.

## Rule: enforce the boundaries

If any request would violate these boundaries, refuse and explain which boundary it violates and why. Do not implement a partial or workaround version.

## Phase 2 (branch `phase-2` only)

The Kiroween 2026 submission is `main` as of the deadline, December 4, 2026, 2:00 PM PT. Tag `mvp-contest-2026` stays as the MVP restore point. The limits and prohibitions above stay in force. On the `phase-2` branch, these items are in scope, specified in `.kiro/specs/aerobrief-phase2/`:

- More US airports, international hubs, and flight, tail number and route tracking.
- Additional data sources (FlightAware, OAG, Cirium, ADS-B Exchange), through licensed APIs only.
- SMS, Slack, PagerDuty and outbound webhooks.
- History up to 3 years, trend analysis and machine-learning predictions.
- Billing tiers.
- Organization accounts, single sign-on, user provisioning, roles and audit logs.
- Alert routing rules, escalation and daily digests.
- API keys and multi-region hosting.
- Drag-and-drop dashboards and white-labeling.
- Dark mode and WCAG 2.1 AAA.

These still apply in Phase 2:

- No scraping of any site. Third-party data comes only from a provider's licensed API, after its terms are reviewed and a key or contract exists.
- Push notifications to devices, map view, native mobile apps, FAA SWIM and user passwords stay prohibited. Single sign-on and magic links are the only ways to sign in.
- Every technology outside `tech.md` is flagged and approved before use, as `tech.md` requires.
- Billing and any commercial use wait for a review of the FAA data terms and of each data provider's license.
- Every Phase 2 feature sits behind its own feature flag, off by default. With every flag off, the app behaves exactly as `main`.
- Every Phase 2 schema change is a separate, reversible migration, tested on a Neon branch first. The owner applies it to the production database.
- Phase 2 Workers deploy under separate names and never to the production Workers.
- After the deadline (December 4, 2026, 2:00 PM PT), `main` is frozen until judging has finished.

## Rule: roll back

If a Phase 2 feature fails, turn its flag off and revert its commits on `phase-2`. If the branch as a whole fails, delete it: `main` and tag `mvp-contest-2026` are the contest MVP.
