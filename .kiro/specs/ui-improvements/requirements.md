# Requirements Document

## Introduction

This spec records the owner's document "AeroBrief UI Improvements: Requirements Document, Draft v0.1" (17 requirements, 100 acceptance criteria, received 2026-11-24) and decides what ships before the Kiroween deadline. The build covers `apps/web`, a small additive change to `apps/api` and `packages/core`, and no database migration.

**Owner decisions (2026-11-24).**

1. The owner approved a split. The "before the deadline" set is built now and ships to `main` before December 4, 2026, 2:00 PM PT. `main` is frozen after the deadline until judging has finished. Everything else is recorded as Deferred with its reason and has no tasks.
2. The airport table markup stays unchanged (hard rule 1 in `.kiro/steering/design.md`). Table grouping, the watch star, sortable headers and hourly strips are therefore Deferred. The nav bar markup MAY change for Requirement 13, and the nav tests are updated.
3. The product is traveler view only. `product.md` stays unchanged. No FAA codes and no raw FAA text are shown. Criteria 3.5, 3.6 and 8.4 are Deferred.
4. The footer ships without Terms and Privacy links until the owner provides legal text.
5. The map view (10.1, 10.2, 10.5) is prohibited by `scope.md`. It is recorded as Out of scope, not Deferred.
6. History stays 24 hours (`scope.md`). Criteria 11.3 (7 and 30 day ranges) and the 7 day list in 6.4 are Deferred. Where a criterion mentions a longer range, the build uses 24 hours.
7. Enterprise scaffolding (16), weather (6.5), automated screenshots (15.4, needs Playwright, outside the approved stack), the full event-type pipeline and every criterion that depends on it, the Airports view changes (5), the airport detail page (6), hourly strips (10.3) and the digest preview with time zone (12.2, needs a migration) are Deferred until after judging.

**What the data supports today.** The poller tracks ground stops only. `packages/core/src/schemas.ts` strips `groundDelay`, `airportClosure` and `freeForm` from the FAA feed. The statuses Minor Impact and Disrupted, delay program and closure incidents, and their explanations, chips and filters need a new pipeline (schemas, snapshots, detection, explanations, alerts). They are Deferred. The build adapts each requirement to ground-stop-only data and degrades as the criteria say.

**Source of the criterion text.** The criteria below follow the owner's counts per requirement and the owner's summary of each. Criteria marked Build now are specified in full. For Deferred and Out of scope criteria, the text is the owner's intent in short form. Whoever picks up a Deferred criterion re-reads the owner's original document first.

**Disposition marks.** Every criterion ends with one of: **Build now**, **Deferred** (reason), **Out of scope** (reason). A criterion with two parts carries two marks.

**Relationship to other specs.** `.kiro/specs/ui-refresh/` built the Settings page, the app shell and the Status dashboard that this spec extends. This spec follows its guardrails: no new runtime dependencies, restyle with CSS and class names, no change to the airport table markup, WCAG 2.1 AA for every color pair. The owner already approved lifting the `tokens.css`, `palette.ts` and existing-test guardrail for this kind of work (ui-refresh decision D8). `.kiro/specs/core30-limits/` set 30 airports and a watchlist cap of 30. `.kiro/specs/aerobrief-phase2/` flags keep working: with every flag off the new UI still works.

**Rollout.** The work is built on branch `phase-2`. The owner reviews a Vercel Preview of `phase-2` (signed-out views only, because sign-in works only on `www`), then fast-forwards `main` and pushes before the deadline. Rollback is `git revert` of the commit range.

## Glossary

- **Frontend**: The React 18 + Vite app in `apps/web`.
- **API**: The Cloudflare Worker in `apps/api`.
- **Core**: The pure TypeScript package `packages/core`.
- **Airport_Status**: One of Normal, Minor Impact, Disrupted, Ground Stop, Recovering, Data Unavailable. Each has one icon (check, info circle, warning triangle, stop octagon, clock with arrow, question mark), one color and one text label. The build derives Normal, Ground Stop, Recovering and Data Unavailable. Minor Impact and Disrupted are defined and styled but never derived until the deferred pipeline exists.
- **Status_Deriver**: The pure Core function that returns the Airport_Status of one airport.
- **Incident**: One disruption at one airport from its start to its end. For ground stops, the GROUND_STOP_STARTED event and the GROUND_STOP_ENDED event that share one FAA event key form one Incident.
- **Incident_Key**: The event key of a stored event (the FAA event id of a ground stop). The API returns it as `incidentKey`.
- **Incident_Card**: The single card that shows one Incident.
- **Recovery_Period**: The time after a ground stop ends during which the airport status is Recovering. The default is 24 hours. It is one named constant in Core.
- **Normalization_Estimate**: The range of time after an Incident ends in which operations are likely to be back to normal. AeroBrief computes it from the Incident duration. It is always labeled "AeroBrief estimate".
- **Stale**: The `stale` flag of the status response: the newest snapshot is older than 600 seconds (two polling intervals of 5 minutes).
- **Freshness**: One of Live, Delayed, Unavailable (Requirement 9).
- **Freshness_Chip**: The chip in the page header that shows the Freshness.
- **Network_Summary**: The Overview card that states the status of all 30 airports.
- **Status_View**: The Status page dashboard with the Overview, Events and Airports panes.
- **Section_Menu**: The shared sub-navigation of hash links (Status sections, Settings sections).
- **Nav_Bar**: The top navigation `<nav aria-label="Main">`.
- **Time_Text**: The one component that renders every timestamp as a `<time datetime>` element with a tooltip.
- **Display_Setting**: The browser-stored choice of Relative, Airport local, My local or UTC.
- **Airport_Time_Zone**: The IANA time zone of an airport, from a static table in Core.
- **Local_Watchlist**: The list of airport codes a signed-out visitor keeps in browser storage.
- **Query_State**: The filter and search values kept in the URL query string.
- **Traveler_View**: The only view built now: plain language, no FAA codes and no raw FAA text.
- **Operations_View**: A deferred view that shows FAA codes and source text.
- **Theme_Variants**: `light`, `dark`, `hc-light`, `hc-dark`.
- **palettePairs**: The list of foreground and background color pairs in `apps/web/src/styles/palette.ts`.
- **Flags_Guard**: `tests/flags-off-guard.test.ts`, which pins SHA-256 hashes of `tokens.css` and `palette.ts`.
- **Touch_Target**: The clickable area of a control: at least 44 by 44 CSS px.
- **Narrow_Layout**: A viewport narrower than 768 CSS px.
- **Deadline**: December 4, 2026, 2:00 PM PT.

## Requirements

### Requirement 1: Recovery-aware airport status

**User Story:** As a traveler, I want to see that an airport is recovering after a ground stop, so that I do not read "Normal" while flights are still catching up.

#### Acceptance Criteria

1. THE Frontend SHALL show each airport with exactly one Airport_Status from the set Normal, Minor Impact, Disrupted, Ground Stop, Recovering and Data Unavailable. **Build now** for Normal, Ground Stop, Recovering and Data Unavailable. **Deferred** for Minor Impact and Disrupted (delay programs and closures are not tracked until the event-type pipeline exists).
2. WHEN a ground stop at an airport ends, THE Status_Deriver SHALL set the status of that airport to Recovering for the Recovery_Period, unless a new ground stop begins at that airport during the period. The Recovery_Period runs from the stored time of the GROUND_STOP_ENDED event. With 24 hour retention, the Recovery_Period is bounded by the events that are stored. **Build now**
3. WHEN the Overview pane renders, THE Network_Summary SHALL state the count of airports per Airport_Status and SHALL name each airport whose status is not Normal, by city and airport code. **Build now**
4. WHILE every airport has the status Normal and the data is not Stale, THE Network_Summary SHALL show the headline "All 30 airports operating normally" with the time of the most recent stored event, or the text "No events in the last 24 hours" when none is stored. **Build now**
5. WHILE the data is Stale, THE Network_Summary SHALL show the last known status of each airport with an "outdated" marker and SHALL NOT show a headline that says the airports are operating normally. WHILE no status data exists, THE Network_Summary SHALL show every airport as Data Unavailable. **Build now**
6. WHILE an airport has the status Recovering, THE Frontend SHALL show the time since the ground stop ended and the Normalization_Estimate, labeled "AeroBrief estimate" with its basis ("based on how long the ground stop lasted; not an FAA figure"). **Build now**
7. THE Network_Summary SHALL show a summary chip for ground stops and a summary chip for recovering airports, each with its count. **Build now** for these two chips. **Deferred** for the delay program and closure chips (event types are not tracked).
8. THE Frontend SHALL give each Airport_Status its own icon, its own color and its own text label, and SHALL convey the status by the text label alone when color and icon are not perceived. Inside the Status_View the icon is a CSS `mask-image` on an `aria-hidden` span. Outside the Status_View the icon is an inline SVG or the same mask span. **Build now**

### Requirement 2: One card per incident

**User Story:** As a traveler, I want one card for each disruption, so that I read a start and an end as one story and not as two unrelated events.

#### Acceptance Criteria

1. WHEN the stored events contain a GROUND_STOP_STARTED event and a GROUND_STOP_ENDED event with the same Incident_Key, THE Frontend SHALL merge them into one Incident_Card that shows the type, the airport, the start time, the end time and the duration. **Build now** for ground stops. **Deferred** for delay program and closure Incidents (event types are not tracked).
2. WHILE an Incident is active, THE Incident_Card SHALL use the severity style and SHALL show the elapsed time since the start. WHILE an Incident has ended, THE Incident_Card SHALL use a neutral resolved style with a check icon and no alarm stripe. **Build now**
3. WHEN the user expands an Incident_Card, THE Incident_Card SHALL show a timeline of the start and the end, and the recovery status of the airport. **Build now**
4. WHEN the user expands an Incident_Card, THE Incident_Card SHALL show a link to the FAA NAS Status site and SHALL NOT show raw FAA text. **Build now**
5. THE Frontend SHALL sort Incident_Cards with active Incidents first, then ended Incidents by most recent end time first. **Build now**
6. THE Incident_Card SHALL link to the existing airport page `/airport/:code`. **Build now**
7. THE Incident_Card SHALL state active or ended by an icon and by text. **Build now**

### Requirement 3: Structured explanations

**User Story:** As a traveler, I want an explanation with the same labeled fields every time, so that I find the cause, the impact and the next update at a glance.

#### Acceptance Criteria

1. THE Incident_Card SHALL present its explanation as the labeled fields "What's happening", "Why", "Likely impact", "Next update" and "Source". **Build now** for ground stops and system-wide disruptions. **Deferred** for the other event types (not tracked).
2. IF the FAA published no reason for an Incident, THEN THE Incident_Card SHALL show "Reason not published by the FAA" in the field "Why". **Build now**
3. IF no expected end or next update time is known, THEN THE Incident_Card SHALL show "Not yet announced" in the field "Next update". **Build now**
4. WHERE a field holds an estimate, THE Incident_Card SHALL label it as an estimate, SHALL show a range and SHALL state its basis. **Build now**
5. WHERE the owner asks to see the original FAA wording, THE Frontend SHALL offer a "View source" control. **Deferred** (needs the Operations_View and raw FAA text; the product is traveler view only).
6. WHERE the owner asks for the Operations_View, THE Frontend SHALL offer a Traveler/Operations toggle. **Deferred** (traveler view only; `product.md` stays unchanged).
7. IF a field has no value, THEN THE Incident_Card SHALL show the text "Not available" in that field and SHALL NOT leave the field empty. **Build now**

### Requirement 4: Watchlist for signed-out visitors

**User Story:** As a visitor without an account, I want to keep a watchlist in my browser, so that I see my airports without signing in.

#### Acceptance Criteria

1. WHEN a signed-out visitor opens the Watchlist page, THE Frontend SHALL show quick-add chips for ATL, DFW and LAS and an airport search, and SHALL store the Local_Watchlist in browser storage. **Build now**
2. WHILE the visitor is signed out, THE Watchlist page SHALL show the Airport_Status of each watched airport. **Build now**
3. WHEN a visitor with a non-empty Local_Watchlist signs in, THE Watchlist page SHALL offer to add the saved airports to the account, up to the cap of 30 airports, and SHALL tell the visitor how many airports it could not add. **Build now**
4. WHILE the visitor is signed out, THE Watchlist page SHALL show a note that the daily digest and alerts need an account, and the note SHALL NOT block any control. **Build now**
5. THE Watchlist page SHALL sort watched airports by severity and SHALL show a one-line explanation of the sort order. **Build now**
6. WHILE the visitor is signed out, THE Watchlist page SHALL NOT show an error banner. **Build now**

### Requirement 5: Airports view

**User Story:** As a traveler, I want to scan airports grouped by status, so that the affected airports are first.

#### Acceptance Criteria

1. THE Airports pane SHALL group airports by Airport_Status in order of severity. **Deferred** (needs table markup changes; hard rule 1 in `design.md` keeps the airport table markup unchanged).
2. THE Airports pane SHALL show a header with the airport count above each group. **Deferred** (same reason as 5.1).
3. THE Airports pane SHALL show a star on each row that adds or removes the airport from the watchlist. **Deferred** (same reason as 5.1).
4. WHERE a column is sortable, THE Airports pane SHALL show a sortable header with the state in `aria-sort`. **Deferred** (same reason as 5.1).
5. THE Airports pane SHALL show the recovery details of an airport in its row. **Deferred** (same reason as 5.1; recovery details appear in the Network_Summary and the Incident_Card instead).
6. THE Airports pane SHALL show an hourly strip per airport. **Deferred** (needs table markup changes and hourly data; see 10.3).
7. THE Airports pane SHALL keep the group headers visible while the table scrolls. **Deferred** (same reason as 5.1).
8. THE Airports pane SHALL hide groups with no airports. **Deferred** (same reason as 5.1).

### Requirement 6: Airport detail page

**User Story:** As a traveler, I want a detail page per airport, so that I see its status, causes and history in one place.

#### Acceptance Criteria

1. THE Frontend SHALL show the Airport_Status and its explanation at the top of the airport page. **Deferred** (after judging; the existing `/airport/:code` page stays as it is).
2. THE Frontend SHALL show a timeline of the Incidents of the last 24 hours on the airport page. **Deferred** (after judging).
3. THE Frontend SHALL show the current ground stop details on the airport page. **Deferred** (after judging; the existing page already shows them).
4. THE Frontend SHALL show a 7 day list of Incidents on the airport page. **Deferred** (history retention is 24 hours by `scope.md`).
5. THE Frontend SHALL show the weather at the airport. **Deferred** (no weather source; third-party data needs a licensed API and a terms review).
6. THE Frontend SHALL show a watch or unwatch button on the airport page. **Deferred** (after judging).

### Requirement 7: Time display

**User Story:** As a traveler in another time zone, I want times in the zone I choose, so that I do not convert them in my head.

#### Acceptance Criteria

1. THE Time_Text SHALL show a relative time (for example "25 min ago") when the age is under 48 hours, and an absolute time when the age is 48 hours or more. **Build now**
2. WHEN the user hovers over, focuses or taps a Time_Text, THE Time_Text SHALL show a tooltip with the airport local time, the user local time and the UTC time. **Build now**
3. THE Settings page SHALL offer a Display_Setting with the choices Relative, Airport local, My local and UTC, and the Frontend SHALL store the choice in the browser. **Build now**
4. WHILE no Display_Setting is stored, THE Frontend SHALL use Relative and SHALL use the browser time zone as the user local time zone. **Build now**
5. WHILE a page with a relative time is open, THE Frontend SHALL refresh every relative time at least once a minute. **Build now**
6. THE Time_Text SHALL render a `<time datetime>` element with an ISO 8601 value, and the tooltip SHALL be reachable by keyboard. **Build now**

### Requirement 8: Plain-language labels

**User Story:** As a traveler, I want labels in plain words, so that I understand every term without aviation knowledge.

#### Acceptance Criteria

1. THE Frontend SHALL label the count of ARTCCs as "Regions affected" and SHALL provide a definition of Air Route Traffic Control Center that a keyboard user and a screen reader user can reach. **Build now**
2. THE Frontend SHALL name each event type in plain words, including delay programs and closures. **Build now** for ground stop and system-wide disruption (the existing labels). **Deferred** for delay programs and closures (event types are not tracked).
3. THE Frontend SHALL title the page "Airport status" and not "National status". **Build now**
4. WHERE the Operations_View is on, THE Frontend SHALL show the FAA code next to the plain-language name. **Deferred** (traveler view only; no FAA codes are shown).
5. THE Frontend SHALL write page titles and subtitles that do not refer only to ground stops and that state what AeroBrief tracks now (30 airports). **Build now**

### Requirement 9: Freshness indicator

**User Story:** As a traveler, I want one clear sign of how fresh the data is, so that I know whether to trust what I read.

#### Acceptance Criteria

1. THE Freshness_Chip SHALL show Live, Delayed or Unavailable in the page header. **Build now**
2. WHEN the user hovers over or focuses the Freshness_Chip, THE Freshness_Chip SHALL show the exact timestamp of the data. **Build now**
3. THE Frontend SHALL NOT repeat a "Data as of" line in the panes that the Freshness_Chip covers. **Build now**
4. WHEN the Freshness changes, THE Frontend SHALL announce the new Freshness in a polite live region, and SHALL NOT announce unchanged Freshness. WHILE the first status request runs, THE Frontend SHALL show loading skeletons with visible loading text. **Build now**
5. IF a status request fails, THEN THE Frontend SHALL keep the last known data on screen and SHALL show the Freshness Delayed. IF a status request fails and no data was ever loaded, THEN THE Frontend SHALL show the Freshness Unavailable. **Build now**

### Requirement 10: Visual network summary

**User Story:** As a traveler, I want a visual summary of the network, so that I see the national picture at once.

#### Acceptance Criteria

1. THE Frontend SHALL show a map of the airports with their statuses. **Out of scope** (map view is prohibited by `scope.md`).
2. WHEN the user selects an airport on the map, THE Frontend SHALL show its status. **Out of scope** (map view is prohibited by `scope.md`).
3. THE Frontend SHALL show an hourly strip of the last 24 hours per airport or region. **Deferred** (needs hourly data and table markup changes).
4. THE Frontend SHALL show a legend that explains the status colors and icons of the visual summary. **Deferred** (there is no visual summary to explain until 10.3 ships; the Status_Badge already carries text).
5. THE Frontend SHALL offer the map as the default view on wide screens. **Out of scope** (map view is prohibited by `scope.md`).

### Requirement 11: Filters and search

**User Story:** As a traveler, I want to filter and search, so that I find my airport and my events quickly.

#### Acceptance Criteria

1. THE Airports pane SHALL offer the filters "All (N)" and "Affected (N)", where N is the count, and SHALL show the selected filter with a state that differs from the other filter by more than color. **Build now**
2. THE Airports pane SHALL offer a search field with the placeholder "Search by code or city (for example, LAS, Las Vegas)", a search icon and a clear button, and SHALL match the airport code, the name and the city without regard to letter case. **Build now**
3. THE Events pane SHALL offer the time ranges 24 hours, 7 days and 30 days. **Deferred** (history retention is 24 hours by `scope.md`; the build shows 24 hours only).
4. THE Events pane SHALL offer filters by airport, by event type and by state (active or ended). **Build now** for the event types that exist (ground stop, system-wide disruption). **Deferred** for delay programs and closures (event types are not tracked).
5. WHEN a filter or a search changes, THE Frontend SHALL announce "Showing X of Y" in a polite live region. **Build now**
6. IF no item matches the filters, THEN THE Frontend SHALL show an empty state with a "Clear filters" button. **Build now**
7. THE Frontend SHALL keep the filter and search values in the URL query string and SHALL keep the URL hash for the section. **Build now**

### Requirement 12: Settings structure

**User Story:** As a user, I want a Settings page with a clear order and clear feedback, so that I know what I changed and what was saved.

#### Acceptance Criteria

1. THE Settings page SHALL list its sections in the order Daily digest, Webhooks, Display, Account. **Build now**
2. THE Settings page SHALL show a preview of the daily digest and a time zone choice for the digest. **Deferred** (the time zone needs a database migration; the preview needs a new endpoint).
3. THE Display section SHALL show the theme as a segmented control with a live preview. **Build now**
4. THE Display section SHALL show the description of High contrast beneath its label and SHALL link it with `aria-describedby`. **Build now**
5. WHEN a setting is saved, THE Settings page SHALL show "Saved". IF saving fails, THEN THE Settings page SHALL show an error with a Retry button. **Build now**
6. WHILE the visitor is signed out, THE Settings page SHALL show a lock indicator and a sign-in prompt on the sections that need an account, and SHALL store the Display section in the browser. **Build now**

### Requirement 13: Navigation and responsiveness

**User Story:** As a traveler on a phone, I want navigation that fits a small screen, so that I reach every page with one thumb.

#### Acceptance Criteria

1. THE Nav_Bar SHALL show "Sign in" as a button that is visually separate from the links while the visitor is signed out, and SHALL show an account menu while the visitor is signed in. **Build now**
2. THE Nav_Bar and the Section_Menu SHALL use one active indicator style and SHALL set `aria-current="page"` on the current Nav_Bar link. **Build now**
3. WHILE the viewport is a Narrow_Layout, THE Nav_Bar SHALL collapse into a menu and THE Section_Menu SHALL render as a horizontal tab bar. **Build now**
4. THE Nav_Bar and the Section_Menu SHALL give every control a Touch_Target. **Build now**
5. THE Frontend SHALL remain usable at a viewport width of 320 CSS px without horizontal page scrolling. **Build now**

### Requirement 14: Footer

**User Story:** As a visitor, I want a footer with the source and the limits of the data, so that I know where it comes from and how far to trust it.

#### Acceptance Criteria

1. THE Footer SHALL link to the API documentation, to the FAA NAS Status API as the data source, to the Terms and to the Privacy page. **Build now** for the API documentation and the data source links. **Deferred** for Terms and Privacy (the owner has not provided legal text; the footer ships without these links).
2. THE Footer SHALL show the notice "Information is advisory and not for operational flight decisions." **Build now**
3. THE Footer SHALL show the license and the hackathon attribution as a secondary line. **Build now**
4. THE Footer SHALL use the shared spacing scale, underlined links with a visible focus indicator, and SHALL stay at the bottom of the viewport on pages shorter than the viewport. **Build now**

### Requirement 15: Layout consistency

**User Story:** As a user, I want every page to share one layout, so that pages feel like one product.

#### Acceptance Criteria

1. THE Frontend SHALL render the header, `<main>` and the footer in one container of the same maximum width. **Build now**
2. THE Frontend SHALL align the left edge of the page title, the page content and the footer text on every page. **Build now**
3. THE Frontend SHALL space page sections with values from the spacing scale 4, 8, 12, 16, 24, 32, 48 and 64 px. **Build now**
4. THE repository SHALL hold automated screenshots of every page at each test width. **Deferred** (needs Playwright, which is outside the approved stack in `tech.md`; the existing `docs/responsive-check.md` manual check stays).

### Requirement 16: Enterprise scaffolding

**User Story:** As an operations team lead, I want organization-level views, so that my team shares one set of airports and alerts.

#### Acceptance Criteria

1. THE Frontend SHALL offer an organization dashboard of shared airports. **Deferred** (after judging; Phase 2 spec `aerobrief-phase2` owns organization accounts).
2. THE Frontend SHALL offer role-based views. **Deferred** (after judging; same reason as 16.1).
3. THE Frontend SHALL offer an audit view of changes. **Deferred** (after judging; same reason as 16.1).
4. THE Frontend SHALL offer API key management. **Deferred** (after judging; same reason as 16.1).
5. THE Frontend SHALL offer single sign-on settings. **Deferred** (after judging; same reason as 16.1).

### Requirement 17: Accessibility

**User Story:** As a user with a visual, motor or cognitive disability, I want every new screen to meet WCAG 2.1 AA, so that I can use AeroBrief.

#### Acceptance Criteria

1. THE Frontend SHALL meet the WCAG 2.1 AA contrast ratios (4.5:1 for normal text, 3:1 for large text, component boundaries and focus indicators) in all four Theme_Variants for every new color pair, including every Airport_Status color, and SHALL list every such pair in `palettePairs`. **Build now**
2. THE Frontend SHALL NOT convey a status, a state or a filter selection by color alone. **Build now**
3. THE Frontend SHALL make every new control operable by keyboard and SHALL show a focus indicator at least 2 px wide. **Build now**
4. WHEN a status, a count or a filter result changes, THE Frontend SHALL announce the change in a polite live region and SHALL NOT use an assertive live region for it. **Build now**
5. WHERE a table column is sortable, THE Frontend SHALL use a semantic table and SHALL set `aria-sort` on the sorted header. **Build now** (no sortable column ships; the rule applies when 5.4 ships).
6. THE repository SHALL run an axe check for every page in CI, extending the all-variants matrix with the new pages and states. **Build now**

## Disposition Summary

| Requirement | Build now | Deferred | Out of scope |
|---|---|---|---|
| 1 Recovery-aware status | 1.1 (4 of 6 statuses), 1.2, 1.3, 1.4, 1.5, 1.6, 1.7 (2 chips), 1.8 | 1.1 (Minor Impact, Disrupted), 1.7 (delay, closure chips) | none |
| 2 One card per incident | 2.1 (ground stops), 2.2, 2.3, 2.4, 2.5, 2.6, 2.7 | 2.1 (delay, closure Incidents) | none |
| 3 Structured explanations | 3.1 (ground stops, system-wide), 3.2, 3.3, 3.4, 3.7 | 3.1 (other types), 3.5, 3.6 | none |
| 4 Signed-out watchlist | 4.1, 4.2, 4.3, 4.4, 4.5, 4.6 | none | none |
| 5 Airports view | none | 5.1 to 5.8 | none |
| 6 Airport detail page | none | 6.1 to 6.6 | none |
| 7 Time display | 7.1 to 7.6 | none | none |
| 8 Plain-language labels | 8.1, 8.2 (existing labels), 8.3, 8.5 | 8.2 (delay, closure labels), 8.4 | none |
| 9 Freshness | 9.1 to 9.5 | none | none |
| 10 Visual summary | none | 10.3, 10.4 | 10.1, 10.2, 10.5 |
| 11 Filters and search | 11.1, 11.2, 11.4 (existing types), 11.5, 11.6, 11.7 | 11.3, 11.4 (delay, closure types) | none |
| 12 Settings | 12.1, 12.3, 12.4, 12.5, 12.6 | 12.2 | none |
| 13 Navigation | 13.1 to 13.5 | none | none |
| 14 Footer | 14.1 (API docs, data source), 14.2, 14.3, 14.4 | 14.1 (Terms, Privacy) | none |
| 15 Layout | 15.1, 15.2, 15.3 | 15.4 | none |
| 16 Enterprise | none | 16.1 to 16.5 | none |
| 17 Accessibility | 17.1 to 17.6 | none | none |
