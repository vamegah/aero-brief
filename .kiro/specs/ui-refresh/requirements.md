# Requirements Document

## Introduction

This spec covers a UI refresh of the AeroBrief web app (`apps/web`), requested by the owner on 2026-11-24. It has three parts.

1. **Settings page.** Display settings, Daily digest, Webhooks and Account move off the Watchlist page (and Display settings off every page) into a new Settings page at `/settings`, with a side menu that becomes a horizontal tab bar on narrow screens.
2. **Enterprise look.** One app shell, one content width, card surfaces with thin borders, denser tables, status pills, a refined type scale and a quieter palette, in all four themes.
3. **Phone layout fix.** On a ~390 px iPhone the Watchlist table header wraps mid-word ("STATU S"), the "Not watching" pill and the "Add" button wrap one character per line, and the name column takes most of the width. Every page must work from 320 to 430 px and on desktop.

Root cause of the wrapping, found in the code: `index.css` and `primitives.css` set `overflow-wrap: anywhere` on every table cell. That value lets the browser shrink a column to one character, so narrow columns collapse. This spec removes that rule and adds nowrap and minimum widths.

The change is built on branch `phase-2`. The owner reviews the palette on a Vercel Preview of `phase-2`, then ships the refresh to `main`, unflagged, before the Kiroween deadline (December 4, 2026, 2:00 PM PT). Rollback is `git revert` of the refresh commit range. The owner approved every decision on 2026-11-24; they are listed in `design.md` ("Decisions (approved 2026-11-24)").

**Relationship to other specs.** The owner's decision of 2026-11-24 (D8) supersedes these Phase 2 items for this refresh: Requirement 3 ("flags off behaves as `main`", now read as same behavior, not same pixels, because the palette is retuned), 8.1 (Theme control "outside the nav bar and the footer", now inside `<main>` on `/settings`), 9.7, 9.12 (same controls "on every page", now on `/settings` only), 10.1 (digest section "on the Watchlist page"), and the Phase 2 guardrail against editing `tokens.css`, `palette.ts` and existing tests. The Webhooks section also leaves the Watchlist page. The refresh is MVP polish approved by the owner (D9). It is not a Phase 2 item, so the "contest set only" merge rule does not apply to it. The Phase 2 spec is edited only by task 0.2 (a one-line pointer to this spec above each affected requirement).

**Addendum 2026-11-24: Status dashboard.** The owner reviewed the refresh and said: "The Events in the last 24 hours are the important part of the application. I don't like the fact that they are way below the page. Can we have it be a dashboard under a menu." The owner approved option A: the Status page (`/`) becomes a dashboard with its own section menu, in the same pattern as the Settings page. The sections are Overview, Events and Airports. Requirements 17 to 23 cover this. They change only `apps/web`: the filters are pure UI over the events the page already loads, so no API, database or poller change is needed and history stays 24 hours. Requirements 1 to 16 are unchanged. The owner's Preview review (task 10) runs after the dashboard tasks, so that the owner reviews everything at once.

## Glossary

- **Frontend**: The React 18 + Vite app in `apps/web`.
- **Settings_Page**: The page rendered at `/settings`.
- **Settings_Menu**: The list of Section links on the Settings_Page. A vertical side list on a Wide_Viewport and a horizontal tab bar on a Narrow_Viewport.
- **Section**: One of Display, Daily digest, Webhooks, Account.
- **Section_Id**: The lowercase id of a Section: `display`, `digest`, `webhooks`, `account`.
- **Visible_Section**: A Section whose flag condition is met (Requirement 1).
- **Active_Section**: The one Visible_Section that the Settings_Page shows.
- **Feature_Flags**: The four booleans from `useFeatures()`: `darkMode`, `highContrast`, `digests`, `webhooks`.
- **Nav_Bar**: The existing `<nav aria-label="Main">` rendered by `NavBar.tsx`.
- **App_Shell**: The site header (brand and Nav_Bar), `<main>`, and the footer.
- **Layout_Max**: The CSS token `--layout-max`, the maximum content width shared by header, main and footer.
- **Narrow_Viewport**: A viewport at most 640 CSS px wide.
- **Wide_Viewport**: A viewport at least 641 CSS px wide.
- **Test_Widths**: 320, 375, 390 and 430 px, plus desktop widths 1024, 1440 and 1920 px.
- **Airport_Tables**: The Status page table (`AirportTable`) and the Watchlist page table (`WatchlistTable`).
- **Stacked_Layout**: The CSS layout in which each `tbody tr` of an Airport_Table renders as a block row whose cells sit on a grid, used on a Narrow_Viewport.
- **Status_Pill**: The `StatusPill` element: an icon span plus status text.
- **Touch_Target**: The clickable area of a control: at least 44 by 44 CSS px.
- **Card**: A surface with `color-surface-raised` background, a 1px `color-table-rule` border, `--radius-md` corners and no box shadow.
- **Theme_Variants**: `light`, `dark`, `hc-light`, `hc-dark`.
- **palettePairs**: The list of foreground/background pairs in `apps/web/src/styles/palette.ts`.
- **Flags_Guard**: `tests/flags-off-guard.test.ts`, which pins SHA-256 hashes of `tokens.css` and `palette.ts`.
- **Superseded_Rules**: CSS rules in `app.css`, `primitives.css` or `index.css` that a new stylesheet of this spec redefines.
- **Status_Page**: The page rendered at `/`, titled "National status".
- **Dashboard**: The content of the Status_Page below its page header when the status response has `state` "ok". It holds the Status_Live_Region, the Dashboard_Menu and three Dashboard_Panes.
- **Dashboard_Section**: One of Overview, Events, Airports.
- **Dashboard_Section_Id**: The lowercase id of a Dashboard_Section: `overview`, `events`, `airports`.
- **Active_Dashboard_Section**: The one Dashboard_Section that the Dashboard shows.
- **Section_Menu**: The one shared component that renders a `<nav>` of native hash links. It renders both the Settings_Menu and the Dashboard_Menu.
- **Dashboard_Menu**: The `<nav aria-label="Status sections">` rendered by the Section_Menu on the Dashboard.
- **Dashboard_Pane**: The `<div>` that holds one Dashboard_Section, with the id `status-pane-<Dashboard_Section_Id>`.
- **Status_Live_Region**: The existing `aria-live="polite"` element of the status view. It holds the stale-data banner and the system-wide banner.
- **Event_Feed**: The `events` list that `useStatus` returns: events from the last 24 hours, newest first.
- **Latest_Events**: The first 5 events of the Event_Feed, in Event_Feed order.
- **Monitored_Airports**: The 20 airports in the `airports` list of the status response.
- **Event_Type_Label**: The plain-language name of an event type: "Ground stop started", "Ground stop ended" or "System-wide disruption".
- **Event_Filter**: The pair of an airport value and an event type value. Each value is either one choice or "all".
- **Filter_Function**: The pure function `filterEvents` in `apps/web/src/lib/filter-events.ts`.
- **Data_As_Of_Line**: The text "Data as of" followed by a `<time>` element that shows the `capturedAt` time of the status response.

## Requirements

### Requirement 1: Settings page and menu

**User Story:** As a signed-in user, I want display, digest, webhook and account options in one Settings page, so that the Watchlist page stays short.

#### Acceptance Criteria

1. WHEN a visitor opens `/settings`, THE Frontend SHALL render the Settings_Page with an `<h2>` "Settings" and a Settings_Menu.
2. THE Settings_Menu SHALL be a `<nav aria-label="Settings sections">` that holds one native link per Visible_Section, in the order Display, Daily digest, Webhooks, Account, each with `href="#<Section_Id>"`.
3. WHERE the `darkMode` flag or the `highContrast` flag is on, THE Settings_Page SHALL include the Display Section.
4. WHERE the `digests` flag is on, THE Settings_Page SHALL include the Daily digest Section.
5. WHERE the `webhooks` flag is on, THE Settings_Page SHALL include the Webhooks Section.
6. THE Settings_Page SHALL include the Account Section whatever the flag values.
7. WHEN all four Feature_Flags are off, THE Settings_Page SHALL show the Account Section as the only Visible_Section and the only Settings_Menu link.
8. WHERE a Section is not visible, THE Frontend SHALL not mount that Section and SHALL send no API request for it.
9. THE Settings_Page SHALL render each Section heading as an `<h3>` below the `<h2>` "Settings".

### Requirement 2: Deep links and section switching

**User Story:** As a user, I want a link to one settings section, so that an email or a bookmark opens the right section.

#### Acceptance Criteria

1. THE Settings_Page SHALL read the Active_Section from the URL hash: `#display`, `#digest`, `#webhooks` or `#account`.
2. IF the hash is empty, unknown, or names a Section that is not visible, THEN THE Settings_Page SHALL show the first Visible_Section and SHALL show no error.
3. WHEN the URL hash changes, THE Settings_Page SHALL switch the Active_Section without reloading the page and without moving keyboard focus.
4. THE Settings_Page SHALL show only the Active_Section. THE Settings_Page SHALL keep every other Visible_Section mounted with the `hidden` attribute, so unsaved digest input and the one-time webhook signing secret survive a switch.
5. THE Settings_Menu SHALL mark the link of the Active_Section with `aria-current="true"` and no other link.
6. THE Settings_Page SHALL give each Section pane an element id that differs from its Section_Id, so that following a deep link does not scroll the page.
7. THE Frontend SHALL need no new entry in `apps/web/vercel.json` for `/settings`, because the final rewrite `/(.*)` to `/index.html` already serves the page.

### Requirement 3: Settings page states

**User Story:** As a visitor, I want a clear message when I am signed out or something fails, so that the page is never blank.

#### Acceptance Criteria

1. WHILE the session check for the Settings_Page is running, THE Settings_Page SHALL render the Settings_Menu and the Display Section (where visible), and SHALL show the text "Loading your settings…" in the Daily digest, Webhooks and Account panes without mounting those Sections.
2. IF the watchlist request returns 401, THEN THE Settings_Page SHALL keep the Settings_Menu and the Display Section (where visible), because theme settings are stored in the browser, and SHALL show the sign-in state in the Daily digest, Webhooks and Account panes: the error text "Sign in to manage your settings." and a link "Go to sign in" to `/sign-in`, without mounting those Sections.
3. IF the watchlist request fails with a status other than 401, THEN THE Settings_Page SHALL show the error text and SHALL still render the Settings_Menu and the Sections.
4. WHILE the watchlist has not loaded, THE Settings_Page SHALL pass a null watchlist count to the Daily digest Section, and WHEN the watchlist has loaded, THE Settings_Page SHALL pass the number of airports on the watchlist.
5. WHEN the user confirms "Delete account" and the API succeeds, THE Frontend SHALL navigate to `/`.
6. IF deleting the account fails, THEN THE Settings_Page SHALL show the text "Could not delete your account. Try again." and keep the user on the page.

### Requirement 4: Watchlist page keeps only the watchlist

**User Story:** As a user, I want the Watchlist page to show my airports and nothing else, so that I can scan and edit the list quickly.

#### Acceptance Criteria

1. THE Watchlist page SHALL render only the sign-in message region, the page header with the counter "N of 10 airports watched", the error region, the loading or empty state, and the Watchlist table.
2. THE Watchlist page SHALL not render the Display settings, Daily digest, Webhooks or Account Sections, and SHALL not render a "Delete account" button.
3. IF the watchlist request returns 401, THEN THE Watchlist page SHALL show "Sign in to see your watchlist." and a link "Go to sign in", as it does today.
4. THE Watchlist table SHALL render the "Add" button with the `secondary` variant and the "Remove" button with the `ghost` variant, so that the Watchlist page holds no primary Button.
5. THE Watchlist table SHALL keep the button names "Add <name> to watchlist" and "Remove <name> from watchlist", the pill texts "Watching" and "Not watching", and one `tbody tr` per airport.

### Requirement 5: Navigation

**User Story:** As a user, I want a Settings link in the main navigation, so that I can find the new page.

#### Acceptance Criteria

1. THE Nav_Bar SHALL contain one link "Settings" to `/settings`, placed after the "Watchlist" link, whether or not the visitor has a session.
2. WHEN the pathname is `/settings`, THE Nav_Bar SHALL mark the Settings link with `aria-current="page"`.
3. THE Nav_Bar SHALL keep every other part of its DOM unchanged: element types, link and button order, accessible names, and `aria-current` behavior.
4. THE Frontend SHALL render the Display settings Section only inside the Settings_Page and SHALL not render it after `<main>` on other pages.

### Requirement 6: App shell and headings

**User Story:** As a user, I want one consistent frame and no repeated headings, so that each page starts with its own title.

#### Acceptance Criteria

1. THE Frontend SHALL render exactly one `<h1>` with the text "AeroBrief" as the product name in the site header, on every page.
2. THE Frontend SHALL not render a product-name heading or a tagline inside `<main>` above the page title.
3. THE Status page SHALL show the text "FAA ground stop status for 20 major US airports." as the subtitle of its page header.
4. THE Frontend SHALL limit the inner width of the site header, `<main>` and the footer to Layout_Max (1120 px) and center each, with 16 px horizontal padding on a Narrow_Viewport and 24 px on a Wide_Viewport.
5. WHILE the viewport is Wide, THE site header SHALL show the brand at the left and the Nav_Bar at the right on one row. WHILE the viewport is Narrow, THE site header SHALL show the brand above the Nav_Bar, and the Nav_Bar links SHALL wrap onto further rows instead of scrolling sideways.
6. THE footer SHALL keep its three texts and links unchanged.

### Requirement 7: Surfaces, type and spacing

**User Story:** As a user, I want a calm, consistent look, so that status is easy to find.

#### Acceptance Criteria

1. THE Frontend SHALL render the summary card, event cards, Settings Section panes, empty states, loading states and the Airport_Tables as Cards.
2. THE Frontend SHALL take every font size, spacing and radius in the new stylesheets from the tokens in `tokens.css`, and SHALL use no raw color value in a new stylesheet.
3. THE Frontend SHALL use the type scale: page title `--text-xl` weight 600; Section and card headings `--text-lg` weight 600; body text `--text-md`; table cells and helper text `--text-sm`; table header cells `--text-xs` uppercase.
4. THE Frontend SHALL use a neutral slate surface set and one accent color, and SHALL keep status colors as decoration next to status text.
5. THE Frontend SHALL run transitions at 150 ms ease-out and SHALL disable them WHILE `prefers-reduced-motion: reduce` is set.

### Requirement 8: Airport tables on a Wide_Viewport

**User Story:** As a desk user, I want dense, readable tables, so that I can scan 20 airports at once.

#### Acceptance Criteria

1. THE Frontend SHALL render every table header cell (`thead th`) of an Airport_Table with `white-space: nowrap` and `overflow-wrap: normal`.
2. THE Frontend SHALL apply no `overflow-wrap: anywhere` and no `word-break: break-all` to any cell of an Airport_Table. THE name column SHALL use `overflow-wrap: break-word`.
3. THE Frontend SHALL render the Status column and the Action column of an Airport_Table with `white-space: nowrap` and the minimum width of their content, and the name column SHALL take the remaining width.
4. THE Airport_Tables SHALL use `--text-sm` cell text, 8 px vertical and 16 px horizontal cell padding, and a 1px `color-table-rule` row separator.

### Requirement 9: Airport tables on a Narrow_Viewport

**User Story:** As a phone user, I want each airport as a stacked row, so that nothing wraps mid-word or runs off the screen.

#### Acceptance Criteria

1. WHILE the viewport is Narrow, THE Frontend SHALL render each `tbody tr` of an Airport_Table as a block row on a CSS grid, and SHALL hide the `thead` visually while keeping it in the DOM and the accessibility tree.
2. WHILE the viewport is Narrow, THE Status table row SHALL show the airport code link and the name on the first line, and the Status_Pill with any ground stop details on the second line.
3. WHILE the viewport is Narrow, THE Watchlist table row SHALL show the airport name and id across the full width on the first line, and the Status_Pill at the left and the row button at the right on the second line.
4. THE Frontend SHALL implement Stacked_Layout in CSS only. THE Frontend SHALL change the Airport_Table DOM only by adding the class names `airport-table--status` and `airport-table--watchlist` to the `<table>`.
5. WHILE the viewport is Narrow, THE ground stop details line SHALL wrap at word boundaries and SHALL break inside a word only when the word is wider than the row.
6. IF the owner's phone check (task 10) finds that Stacked_Layout makes VoiceOver lose table semantics, THEN THE Frontend SHALL restore them with `role` attributes on the table elements. The owner approved this fallback on 2026-11-24 (D6); without such a finding, no `role` attribute is added.

### Requirement 10: Pills, buttons and touch targets

**User Story:** As a phone user, I want buttons and pills that stay whole and are easy to tap, so that I can use the app one-handed.

#### Acceptance Criteria

1. THE Frontend SHALL render every Status_Pill with `white-space: nowrap` and `flex: none`, so that a pill never wraps text onto a second line.
2. THE Frontend SHALL render every `.btn` with `white-space: nowrap`, and every button in an Airport_Table row with a minimum width of 5.5rem (88 px).
3. WHILE the viewport is Narrow or the pointer is coarse, THE Frontend SHALL give every button, standalone link, Nav_Bar link and button, Settings_Menu link, radio and checkbox label, `<select>` and text input a Touch_Target of at least 44 by 44 CSS px.
4. THE Frontend SHALL exempt only links inside a running sentence from the Touch_Target rule.
5. WHILE the viewport is Narrow, THE Frontend SHALL render form fields, the Daily digest select and the webhook URL field at the full width of their Card.
6. THE Frontend SHALL style the "Sign out" button in the Nav_Bar with the same size, padding and focus indicator as the Nav_Bar links.

### Requirement 11: Settings menu on narrow and wide screens

**User Story:** As a user on any device, I want the Settings menu to fit the screen, so that I can reach every section.

#### Acceptance Criteria

1. WHILE the viewport is Wide, THE Settings_Page SHALL show the Settings_Menu as a vertical list in a 14rem column at the left of the Active_Section.
2. WHILE the viewport is Narrow, THE Settings_Page SHALL show the Settings_Menu as a horizontal tab bar above the Active_Section, and the tab links SHALL wrap onto a second row when they do not fit.
3. THE Settings_Menu SHALL mark the Active_Section with bold text and a 3px underline or left border, so that the marker does not depend on color.
4. WHILE the viewport is Narrow and all four Sections are visible, THE Settings_Page SHALL cause no horizontal page scroll at 320 px.
5. THE Settings_Menu SHALL be operable with the Tab key and the Enter key on native links, and SHALL show the focus indicator of the active Theme_Variant.

### Requirement 12: Coverage of every page and width

**User Story:** As the owner, I want every page checked at phone and desktop widths, so that no page is left distorted.

#### Acceptance Criteria

1. THE Frontend SHALL cause no horizontal page scroll at any Test_Width on the Status page, the Airport detail page, the Watchlist page, each Section of the Settings_Page, the Sign-in page, the Unsubscribe page, the Digest unsubscribe page, the Not found page and the Auth callback page.
2. THE Frontend SHALL not break a word inside a heading, table header cell, button label or Status_Pill at any Test_Width.
3. THE Frontend SHALL not apply `overflow-x: hidden` to `html`, `body` or `main` to hide an overflow.
4. THE owner SHALL review the palette and check the pages at 320, 375, 390 and 430 px, and at 1024 px or wider, on a Vercel Preview of `phase-2` before `main` is updated.

### Requirement 13: Palette and themes

**User Story:** As a user of any theme, I want the same refreshed look with readable text, so that status stays legible.

#### Acceptance Criteria

1. THE Frontend SHALL give every new or changed color pair a contrast ratio of at least 4.5:1 for normal text and at least 3:1 for large text, component boundaries and focus indicators, in the `light` and `dark` Theme_Variants.
2. THE Frontend SHALL keep the AAA targets of the `hc-light` and `hc-dark` Theme_Variants: 7:1 for normal text and 4.5:1 for large text and UI.
3. IF a pair fails, THEN THE Frontend SHALL fix the token value and SHALL not lower a threshold.
4. THE Frontend SHALL register every color token in `tokens.css`, `palette.ts`, `themes.css` and `themes.ts` with the same value, and SHALL list every new foreground/background combination of the new stylesheets in palettePairs.
5. THE Frontend SHALL keep the `hc-light` and `hc-dark` palette values and SHALL adopt the new layout, Card and menu styles in those variants through structural CSS under `html[data-theme^="hc-"]`, with border widths of at least 2px.
6. THE Frontend SHALL restyle the `dark` variant to match the new light surfaces, with the same Card, header, table, pill and menu styles.
7. WHEN the palette files change, THE repository SHALL update the two hashes in the Flags_Guard in the same commit.
8. THE Frontend SHALL show every status as text, and color SHALL repeat the text and never replace it.

### Requirement 14: States, copy and primary actions

**User Story:** As a user, I want every state to say what is happening, so that I am never left with a blank screen.

#### Acceptance Criteria

1. THE Frontend SHALL render visible text for the loading, empty, error and success state of every page, including the Settings_Page.
2. THE Frontend SHALL show a last-updated timestamp with every displayed status.
3. THE Frontend SHALL write user-facing text in plain language and SHALL not show raw FAA codes.
4. THE Frontend SHALL render at most one primary Button in any view. On the Settings_Page, the only primary Button SHALL be "Save digest settings".
5. WHILE the Frontend has cached data and a refresh fails, THE Frontend SHALL show the cached data with the existing stale or error banner.

### Requirement 15: Constraints that stay in force

**User Story:** As the maintainer, I want the refresh to respect the steering rules, so that nothing outside the approved stack or scope appears.

#### Acceptance Criteria

1. THE Frontend SHALL add no runtime dependency and no icon package.
2. THE Frontend SHALL draw icons as inline SVG, or as CSS `mask-image` data URIs on `aria-hidden` spans, and SHALL render no `<svg>` or `<img>` inside the status view.
3. THE Frontend SHALL keep the DOM structure of the Airport_Tables, the banners, the Nav_Bar and the `aria-live` region unchanged, except for the added Settings link (Requirement 5.1) and the added table class names (Requirement 9.4).
4. WHEN all four Feature_Flags are off, THE Frontend SHALL render every page without error, and THE Settings_Page SHALL show only the Account Section.
5. THE Frontend SHALL keep the 20 monitored airports, the 10-airport watchlist cap and the 24-hour history, and SHALL add no map view, push notification, password sign-in or monetization.
6. THE Frontend SHALL keep `StatusView` free of the text "map" and of class names that contain "map".

### Requirement 16: Tests and verification

**User Story:** As the maintainer, I want automated checks for each change, so that the refresh can ship in a few days with confidence.

#### Acceptance Criteria

1. THE test suite SHALL cover the Settings_Page for section visibility per flag, deep links, hash changes, hidden-but-mounted panes, keyboard operation of the Settings_Menu, and the loading, signed-out and error states.
2. THE test suite SHALL keep the existing tests for the moved components, changing only imports, routes, and placement assertions.
3. THE axe suite in `a11y/themes/all-variants.test.tsx` SHALL run the Settings_Page with each Section active in all four Theme_Variants and SHALL fail on any violation.
4. THE contrast tests SHALL check every pair in palettePairs in all four Theme_Variants.
5. THE test suite SHALL include a CSS regression test that reads the stylesheets and asserts the nowrap, minimum width, Touch_Target, hidden-header and Narrow_Viewport media-query rules.
6. WHEN the work is complete, THE commands `npm test`, `npm run typecheck` and `npm run build -w @aerobrief/web` SHALL pass at the repository root.
7. THE final task SHALL ask the owner to check the deployed pages on a phone.

### Requirement 17: Status dashboard sections and menu

**User Story:** As a visitor, I want the Status page split into sections under a menu, so that the events of the last 24 hours are one click away and not buried below the table.

#### Acceptance Criteria

1. WHEN the status response has `state` "ok", THE Dashboard SHALL render a Dashboard_Menu with one native link per Dashboard_Section, in the order Overview, Events, Airports, each with `href="#<Dashboard_Section_Id>"`.
2. WHEN the status response has `state` "ok", THE Dashboard SHALL render three Dashboard_Panes in the DOM order Overview, Events, Airports, with the `<h3>` headings "Overview", "Events in the last 24 hours" and "Airports".
3. THE Dashboard SHALL render the Dashboard_Menu from the same Section_Menu component as the Settings_Menu, with the same active marker, focus indicator and Touch_Target rules.
4. WHILE the viewport is Wide, THE Dashboard SHALL show the Dashboard_Menu as a vertical list in a 14rem column at the left of the Active_Dashboard_Section.
5. WHILE the viewport is Narrow, THE Dashboard SHALL show the Dashboard_Menu as a horizontal tab bar above the Active_Dashboard_Section, and the tab bar SHALL scroll inside itself when its links do not fit.
6. THE Dashboard_Menu SHALL mark the Active_Dashboard_Section with bold text and a 3px underline or left border, so that the marker does not depend on color.
7. THE Status_Page SHALL cause no horizontal page scroll at any Test_Width with any Dashboard_Section active.
8. IF the status response is loading, has `state` "no_data", or is missing, THEN THE Status_Page SHALL render no Dashboard_Menu and no Dashboard_Pane, and SHALL show the existing loading or empty text.

### Requirement 18: Dashboard deep links and section switching

**User Story:** As a user, I want a link to one dashboard section, so that a bookmark or the "View all events" link opens the Events section.

#### Acceptance Criteria

1. THE Dashboard SHALL read the Active_Dashboard_Section from the URL hash: `#overview`, `#events` or `#airports`.
2. IF the hash is empty or unknown, THEN THE Dashboard SHALL show the Overview section and SHALL show no error.
3. WHEN the URL hash changes, THE Dashboard SHALL switch the Active_Dashboard_Section without reloading the page and without moving keyboard focus.
4. THE Dashboard SHALL show only the Active_Dashboard_Section and SHALL keep the other two Dashboard_Panes mounted with the `hidden` attribute, so that the airport search text, the All or Affected only choice, and the Event_Filter values survive a switch.
5. THE Dashboard_Menu SHALL mark the link of the Active_Dashboard_Section with `aria-current="true"` and no other link.
6. THE Dashboard SHALL give each Dashboard_Pane an element id that differs from its Dashboard_Section_Id, so that following a deep link does not scroll the page.
7. THE Dashboard SHALL render the Status_Live_Region above the Dashboard_Menu and outside every Dashboard_Pane, with its DOM unchanged, so that a stale-data banner or a system-wide banner is shown and announced whichever section is active.

### Requirement 19: Overview section

**User Story:** As a visitor, I want the overall status and the newest events on the first screen, so that I see what is happening without scrolling.

#### Acceptance Criteria

1. THE Overview section SHALL render the SummaryCard, which shows the "Last updated" time.
2. THE Overview section SHALL render an `<h4>` "Latest events" followed by the Latest_Events as an event list.
3. WHILE the Event_Feed holds fewer than 5 events, THE Overview section SHALL render every event of the Event_Feed in Latest_Events.
4. IF the Event_Feed is empty, THEN THE Overview section SHALL show the text "No events in the last 24 hours." in place of the event list.
5. THE Overview section SHALL render a link "View all events" with `href="#events"` after the Latest_Events, whether or not the Event_Feed is empty.

### Requirement 20: Events section and filters

**User Story:** As a user, I want the full last-24-hours feed with filters by airport and by event type, so that I can find the events I care about.

#### Acceptance Criteria

1. THE Events section SHALL render a Data_As_Of_Line and the Event_Filter controls above the event list.
2. THE Events section SHALL render a `<select>` labelled "Airport" whose first option is "All airports", followed by one option per Monitored_Airport in ascending airport code order, each with the text "<code> – <name>".
3. THE Events section SHALL render a `<select>` labelled "Event type" with the options "All types", "Ground stop started", "Ground stop ended" and "System-wide disruption", in that order.
4. WHEN the Events section first renders, THE Events section SHALL show "All airports" and "All types" as the selected options and SHALL list every event of the Event_Feed, newest first.
5. WHEN the user selects an airport, THE Events section SHALL list only the events whose airport equals the selected airport.
6. WHILE the airport choice is "All airports", THE Events section SHALL include events that have no airport, such as system-wide disruptions.
7. WHEN the user selects an event type, THE Events section SHALL list only the events of that type.
8. WHILE both an airport and an event type are selected, THE Events section SHALL list only the events that match both.
9. THE Events section SHALL list the filtered events in the order of the Event_Feed.
10. THE Events section SHALL show the line "Showing N of M events", where N is the number of listed events and M is the number of events in the Event_Feed, outside the Status_Live_Region.
11. IF the Event_Feed is empty, THEN THE Events section SHALL show the text "No events in the last 24 hours." in place of the event list.
12. IF the Event_Feed holds events and none match the Event_Filter, THEN THE Events section SHALL show the text "No events match these filters." in place of the event list.
13. WHEN the user changes an Event_Filter value, THE Frontend SHALL send no API request.
14. THE Events section SHALL render no primary Button.

### Requirement 21: Airports section and dashboard states

**User Story:** As a user, I want the airport table to work as before, and every section to show how fresh its data is, so that I can trust what I read.

#### Acceptance Criteria

1. THE Airports section SHALL render a Data_As_Of_Line and the existing "Filter airports" group with the All and Affected only buttons, the "Search airports" field, the "Showing N of M airports" line, the airport table and its empty states, with the same text, behavior and DOM as before.
2. WHEN the user leaves a Dashboard_Section and returns, THE Dashboard SHALL keep the airport search text, the All or Affected only choice and both Event_Filter values.
3. THE Dashboard SHALL show a last-updated time in every Dashboard_Section: the SummaryCard "Last updated" time in the Overview section, and a Data_As_Of_Line in the Events section and the Airports section.
4. WHILE the displayed status is stale or a refresh has failed, THE Dashboard SHALL keep showing the cached data in every Dashboard_Section and SHALL keep the existing stale or error banner visible.
5. THE Dashboard SHALL write every label, heading and message in plain language and SHALL show no raw FAA code and no event type code such as "GROUND_STOP_STARTED".
6. THE Status_Page SHALL render no primary Button.

### Requirement 22: Event filter function

**User Story:** As a maintainer, I want the filter logic as a pure function, so that the rules are tested without a browser.

#### Acceptance Criteria

1. THE Filter_Function SHALL take a list of events and an Event_Filter, and SHALL return a new list without changing the input list or its events.
2. WHEN both values of the Event_Filter are "all", THE Filter_Function SHALL return every event of the input, in input order.
3. THE Filter_Function SHALL return every event that matches both values of the Event_Filter, and SHALL return no other event.
4. THE Filter_Function SHALL return the matching events in the order of the input.
5. WHEN the airport value is an airport code, THE Filter_Function SHALL exclude every event that has no airport.
6. WHEN the type value is an event type and the airport value is "all", THE Filter_Function SHALL return the events of that type, including events that have no airport.

### Requirement 23: Dashboard constraints and tests

**User Story:** As the maintainer, I want the dashboard to respect the steering and scope rules and to be covered by tests, so that it can ship with the rest of the refresh.

#### Acceptance Criteria

1. THE test suite SHALL cover the Filter_Function with unit tests and with fast-check property tests for: the result is a subset of the input, the result keeps input order, every result matches both filters and no match is omitted, and the "all" and "all" filter returns every event.
2. THE test suite SHALL cover the Dashboard for: the menu links and their order, deep links and the fallback to Overview, a hash change without a focus move, panes that are mounted with `hidden`, `aria-current`, the Status_Live_Region outside the panes, the five Latest_Events and the "View all events" link, the filters, the count line, both empty states, state kept across a switch, and no API request on a filter change.
3. THE axe suite in `a11y/themes/all-variants.test.tsx` SHALL run the Status_Page with the Overview, Events and Airports sections active, with events present, in all four Theme_Variants, and SHALL fail on any violation.
4. THE test suite SHALL change an existing Status_Page test only as listed in `design.md` ("Test compatibility: Status dashboard").
5. THE Frontend SHALL add no runtime dependency, SHALL draw no `<svg>` or `<img>` inside the status view, and SHALL keep the text "map" and class names that contain "map" out of the status view.
6. THE Frontend SHALL give every new color pair a contrast ratio that meets Requirement 13, SHALL list it in palettePairs, and WHEN `tokens.css` or `palette.ts` change, THE repository SHALL update the two hashes in the Flags_Guard in the same commit.
7. THE Frontend SHALL keep the 20 monitored airports and the 24-hour history, SHALL change no API route, database table or poller code, and SHALL add no map view and no push notification.
8. WHEN the dashboard work is complete, THE commands `npm test`, `npm run typecheck` and `npm run build -w @aerobrief/web` SHALL pass at the repository root.
9. THE owner SHALL review the dashboard on the Vercel Preview of `phase-2`, signed out, with the rest of the refresh in task 10, after the dashboard tasks are done.
