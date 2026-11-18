# Requirements Document

## Introduction

AeroBrief is an independent monitor of FAA airport disruptions. When the FAA public status page is unavailable, or a nationwide ground stop occurs, travelers and logistics dispatchers have no independent source explaining what is happening. AeroBrief polls the FAA airport events API, validates and stores snapshots, detects changes, explains them in plain language, and emails users who watch affected airports. The API and web frontend keep serving the last stored snapshot when the FAA is unreachable.

The MVP monitors exactly 20 hardcoded US airports, caps each watchlist at 10 airports, and retains 24 hours of history. The tech stack is fixed by workspace steering: TypeScript strict mode, Cloudflare Workers (poller and API), Neon Postgres with Drizzle ORM, React 18 with Vite on Vercel, Resend for email, Vitest with fast-check for tests, and GitHub Actions for CI.

### Assumptions

1. **Latency definition.** The 5-minute poll interval cannot by itself satisfy an alert latency under 2 minutes, because a disruption can begin up to 5 minutes before the next poll. Alert latency is therefore measured from the moment the Poller stores the snapshot in which a change is detected to the moment the email is handed to Resend. Latency from the real-world FAA event to the poll is bounded by the 5-minute poll interval and is outside this target. The poll interval is not changed.
2. **Passwordless identity.** User passwords are prohibited. Users are identified by email address. Ownership of an email address is proven by a single-use, time-limited magic link sent through Resend. This mechanism is an assumption and is open to review.
3. **FAA payload shape.** The structure of the FAA airport-events response, including how each airport event identifies its ground stop status and its Air Route Traffic Control Center, is assumed and must be confirmed against the live response during design. The Zod schema is the single source of truth for the accepted shape.
4. **Nationwide event counting.** An Air Route Traffic Control Center is counted as affected when at least one Monitored Airport located in that center has an active Ground Stop. Counting is limited to the 20 Monitored Airports because the MVP does not ingest other airports.
5. **Availability measurement.** The 99.9% availability target applies to the AeroBrief API and web frontend, measured per calendar month, and excludes FAA availability by design.
6. **Airport list.** The identity of the 20 Monitored Airports is fixed in source code and is chosen during design.
7. **FAA event identity.** The FAA airport-events schema gives each ground stop object an `id` field, but design.md records that a populated ground stop was not observed in the live response, so the stability of that `id` is unconfirmed. The FAA_Event_ID is therefore the ground stop `id` when present. When `id` is absent, the FAA_Event_ID is a deterministic value derived from the airport identifier and the ground stop start time. When the start time is also absent, the FAA_Event_ID is derived from the airport identifier and the capture time of the Snapshot in which that ground stop was first detected. This assumption must be confirmed against a live populated ground stop.

## Glossary

- **AeroBrief**: The overall system comprising the Poller, API, Notifier, Database, and Frontend.
- **Poller**: The Cloudflare Worker, triggered by a cron schedule, that fetches, validates, stores, and diffs FAA data.
- **API**: The Cloudflare Worker that serves snapshots, events, watchlists, and authentication endpoints to the Frontend.
- **Notifier**: The component that composes alert emails and hands them to Resend.
- **Database**: The Neon Postgres database accessed through Drizzle ORM.
- **Frontend**: The React 18 and Vite web application deployed on Vercel.
- **FAA_API**: The public endpoint https://nasstatus.faa.gov/api/airport-events.
- **Monitored_Airport**: One of the 20 hardcoded US airports that AeroBrief tracks.
- **Snapshot**: A validated, timestamped record of the status of all Monitored_Airports taken from one successful FAA_API response.
- **Previous_Snapshot**: The most recent Snapshot stored before the current Snapshot.
- **Ground_Stop**: An FAA traffic management program that holds departures to an airport.
- **ARTCC**: An Air Route Traffic Control Center, a regional FAA control facility.
- **Affected_ARTCC**: An ARTCC that contains at least one Monitored_Airport with an active Ground_Stop (see Assumption 4).
- **Change_Detector**: The pure function that compares a Snapshot with the Previous_Snapshot, per airport, and returns a list of Events.
- **Event**: A typed record produced by the Change_Detector, of type GROUND_STOP_STARTED, GROUND_STOP_ENDED, or NATIONWIDE_EVENT.
- **Explanation**: A plain-language string, written for travelers and dispatchers, that describes an Event without raw FAA codes.
- **Explanation_Mapper**: The component that maps each Event type to its Explanation.
- **FAA_Event_ID**: The identifier of one FAA ground stop, defined in Assumption 7, shared by the GROUND_STOP_STARTED and GROUND_STOP_ENDED Events of that ground stop.
- **System-wide banner**: A visible Frontend element, shown above the airport list, stating that a nationwide event is active and containing the Explanation of the NATIONWIDE_EVENT Event.
- **Stale_Data_Banner**: A visible Frontend element stating that data is stale and showing the time of the last successful Snapshot.
- **Stale_State**: The condition in which no Snapshot has been stored for more than 10 minutes because FAA_API polls have failed.
- **Watchlist**: The set of Monitored_Airports that a user has chosen to receive alerts for.
- **User**: A person identified by a verified email address.
- **Magic_Link**: A single-use, time-limited URL emailed to a User to prove ownership of an email address.
- **Session**: An authenticated User state established by redeeming a Magic_Link.
- **Alert_Latency**: The elapsed time from the Poller storing the Snapshot that contains a detected change to the Notifier handing the resulting email to Resend (see Assumption 1).
- **Resend**: The third-party transactional email service.

## Requirements

### Requirement 1: Poll the FAA API

**User Story:** As a traveler, I want AeroBrief to check FAA data on a fixed schedule, so that I see current disruption information without relying on the FAA status page.

#### Acceptance Criteria

1. THE Poller SHALL request the FAA_API once every 5 minutes using a Cloudflare Workers cron trigger.
2. IF the FAA_API does not return a complete response within 10 seconds of the request being sent, THEN THE Poller SHALL abort the request, record the poll as failed with a timeout reason, and retain the existing Snapshots unchanged.
3. IF the FAA_API returns a non-2xx HTTP status, THEN THE Poller SHALL record the poll as failed with a reason that includes the received status, and retain the existing Snapshots unchanged.
4. THE Poller SHALL request data only from the FAA_API and no other third-party website.
5. WHEN a poll fails, THE Poller SHALL store the failure time (UTC, millisecond precision) and the failure reason in the Database within 5 seconds of the failure being detected.
6. IF the FAA_API returns a 2xx response whose body cannot be parsed as the expected data format, THEN THE Poller SHALL record the poll as failed with a reason indicating an unparseable response, and retain the existing Snapshots unchanged.
7. IF a poll is still in progress when the next 5-minute trigger fires, THEN THE Poller SHALL skip the new poll and leave the in-progress poll unaffected.

### Requirement 2: Validate and store snapshots

**User Story:** As a maintainer, I want every FAA response validated before it is stored, so that malformed data never reaches users.

#### Acceptance Criteria

1. WHEN the FAA_API returns a response, THE Poller SHALL validate the response body against a Zod schema before writing any data to the Database.
2. WHEN validation succeeds, THE Poller SHALL store exactly one Snapshot in the Database containing one status entry for each of the 20 Monitored_Airports and a capture time, set to the UTC time at which the Poller received the response.
3. IF validation fails, including when the response body is empty or is not parseable, THEN THE Poller SHALL discard the response, record the poll as failed together with a description of the validation error, and leave all previously stored Snapshots unchanged, with no new Snapshot written.
4. WHEN the FAA_API response contains airports that are not Monitored_Airports, THE Poller SHALL exclude those airports from the stored Snapshot and SHALL NOT treat their presence as a validation failure.
5. WHEN the FAA_API response omits a Monitored_Airport, THE Poller SHALL record that airport in the Snapshot with a status of no active disruption.
6. THE Poller SHALL monitor exactly 20 hardcoded Monitored_Airports, and the set SHALL NOT change at runtime.
7. IF writing the Snapshot to the Database fails, THEN THE Poller SHALL record the poll as failed with a description of the storage error and SHALL NOT leave a partially written Snapshot, so that a Snapshot is either stored with all 20 airport entries or not stored at all.
8. FOR ALL valid FAA_API response bodies, serializing the stored Snapshot to JSON and parsing the result with the Zod schema SHALL produce a Snapshot deeply equal to the stored Snapshot, including the capture time and all 20 airport status entries (round-trip property).

### Requirement 3: Detect changes between snapshots

**User Story:** As a traveler, I want AeroBrief to tell me when an airport enters or leaves a ground stop, so that I can adjust my plans.

#### Acceptance Criteria

1. THE Change_Detector SHALL be a pure function that accepts a Snapshot and a Previous_Snapshot and returns a list of Events, such that calling it twice with equal inputs returns equal lists and no database, network, or file reads or writes occur during the call.
2. WHEN a Monitored_Airport has no active Ground_Stop in the Previous_Snapshot and an active Ground_Stop in the Snapshot, THE Change_Detector SHALL emit exactly one GROUND_STOP_STARTED Event for that airport.
3. WHEN a Monitored_Airport has an active Ground_Stop in the Previous_Snapshot and no active Ground_Stop in the Snapshot, THE Change_Detector SHALL emit exactly one GROUND_STOP_ENDED Event for that airport.
4. WHEN a Monitored_Airport has the same Ground_Stop state (active in both or inactive in both) in the Snapshot and the Previous_Snapshot, THE Change_Detector SHALL emit zero GROUND_STOP_STARTED Events and zero GROUND_STOP_ENDED Events for that airport.
5. WHEN no Previous_Snapshot exists, THE Change_Detector SHALL treat every Monitored_Airport as having no active Ground_Stop in the Previous_Snapshot, so that each Monitored_Airport with an active Ground_Stop in the Snapshot yields one GROUND_STOP_STARTED Event.
6. FOR ALL Snapshots S, the Change_Detector applied to S as the Snapshot and S as the Previous_Snapshot SHALL return an empty list (idempotence property).
7. FOR ALL pairs of Snapshots covering the same set of Monitored_Airports, the number of GROUND_STOP_STARTED Events minus the number of GROUND_STOP_ENDED Events SHALL equal the count of Monitored_Airports with an active Ground_Stop in the Snapshot minus the count of Monitored_Airports with an active Ground_Stop in the Previous_Snapshot (invariant property).
8. THE Change_Detector SHALL include in each GROUND_STOP_STARTED and GROUND_STOP_ENDED Event the Event type, the airport identifier of the affected Monitored_Airport, and the Snapshot capture time.
9. IF the Snapshot or the Previous_Snapshot contains a Monitored_Airport that is absent from the other, THEN THE Change_Detector SHALL treat the absent airport as having no active Ground_Stop in the snapshot that lacks it.
10. THE Change_Detector SHALL return at most one GROUND_STOP_STARTED or GROUND_STOP_ENDED Event per airport, ordered by airport identifier in ascending alphabetical order, followed by any NATIONWIDE_EVENT Event.

### Requirement 4: Detect nationwide events

**User Story:** As a logistics dispatcher, I want AeroBrief to flag widespread disruption, so that I can tell a local problem from a system-wide one.

#### Acceptance Criteria

1. WHEN a Snapshot is processed in which 3 or more ARTCCs are Affected_ARTCCs and fewer than 3 ARTCCs were Affected_ARTCCs in the Previous_Snapshot, THE Change_Detector SHALL emit exactly one NATIONWIDE_EVENT Event for that Snapshot.
2. WHEN a Snapshot is processed in which 3 or more ARTCCs are Affected_ARTCCs and 3 or more ARTCCs were also Affected_ARTCCs in the Previous_Snapshot, THE Change_Detector SHALL emit zero NATIONWIDE_EVENT Events for that Snapshot, including when the set of Affected_ARTCCs differs from the Previous_Snapshot.
3. WHEN a Snapshot is processed and no Previous_Snapshot exists, and 3 or more ARTCCs are Affected_ARTCCs in that Snapshot, THE Change_Detector SHALL emit exactly one NATIONWIDE_EVENT Event.
4. WHEN the API receives a request for nationwide event status and 3 or more ARTCCs are Affected_ARTCCs in the latest Snapshot, THE API SHALL report a nationwide event as active.
5. WHEN the API receives a request for nationwide event status and fewer than 3 ARTCCs are Affected_ARTCCs in the latest Snapshot, THE API SHALL report no nationwide event as active.
6. WHEN the Change_Detector emits a NATIONWIDE_EVENT Event, THE Change_Detector SHALL include in it the count of Affected_ARTCCs, which equals the length of the included list, and the list of Affected_ARTCCs, with each ARTCC appearing once.
7. FOR ALL pairs of Snapshots S1 and S2 where S2 contains every Affected_ARTCC in S1 plus one or more additional Affected_ARTCCs, if a nationwide event is active for S1, THEN THE API SHALL report a nationwide event as active for S2 (monotonicity property).
8. WHEN 3 or more ARTCCs are simultaneously Affected_ARTCCs in the latest Snapshot, THE API SHALL flag a nationwide event as active AND THE Frontend SHALL display the system-wide banner.

### Requirement 5: Explain events in plain language

**User Story:** As a traveler unfamiliar with FAA terminology, I want each event described in plain language, so that I understand what is happening and why.

#### Acceptance Criteria

1. THE Explanation_Mapper SHALL provide, for each of the Event types GROUND_STOP_STARTED, GROUND_STOP_ENDED, and NATIONWIDE_EVENT, a plain-language Explanation string intended for display to users, produced from exactly one Explanation template.
2. WHEN the Explanation_Mapper receives an Event of type GROUND_STOP_STARTED or GROUND_STOP_ENDED, THE Explanation_Mapper SHALL return an Explanation that contains the full name of the affected airport.
3. WHEN the Explanation_Mapper receives an Event of type NATIONWIDE_EVENT, THE Explanation_Mapper SHALL return an Explanation that contains the number of affected ARTCCs as a whole number.
4. THE Explanation_Mapper SHALL return Explanations in which every FAA code (for example, an ARTCC identifier, a reason code, or an airport identifier) that appears is accompanied by a plain-language description of the same cause or location.
5. WHERE the FAA_API supplies a reason for a Ground_Stop, THE Explanation_Mapper SHALL include a plain-language translation of that reason in the Explanation.
6. IF the FAA_API supplies a Ground_Stop reason that has no plain-language translation, THEN THE Explanation_Mapper SHALL return an Explanation that states the FAA has not given a reason AeroBrief can explain, and SHALL NOT include the untranslated reason text as the only description of the cause.
7. IF the FAA_API supplies no reason for a Ground_Stop, THEN THE Explanation_Mapper SHALL return an Explanation that states the FAA has not given a reason AeroBrief can explain.
8. WHEN the Frontend or THE Notifier presents an Event, THE Frontend and THE Notifier SHALL each display the Explanation returned by the Explanation_Mapper for that Event without altering its text.
9. FOR ALL Events of a valid type, THE Explanation_Mapper SHALL return an Explanation of 1 to 500 characters that contains at least one non-whitespace character.
10. IF the Explanation_Mapper receives an Event whose type is not GROUND_STOP_STARTED, GROUND_STOP_ENDED, or NATIONWIDE_EVENT, THEN THE Explanation_Mapper SHALL reject the Event with an error indicating an unsupported Event type and SHALL NOT return an Explanation.

### Requirement 6: Serve data when the FAA is unreachable

**User Story:** As a dispatcher, I want AeroBrief to keep working when the FAA page is down, so that I always have an independent view.

#### Acceptance Criteria

1. WHEN a user request for airport status is received, THE API SHALL return the most recently stored Snapshot from the Database and SHALL make zero calls to the FAA_API while handling that request.
2. WHEN the FAA_API has been unreachable for more than 10 minutes (600 seconds), meaning no successful Snapshot has been stored in that time and the time elapsed since the capture time of the latest stored Snapshot exceeds 10 minutes, THE API SHALL serve the most recent stored Snapshot with a Stale_State indicator and the capture time of that Snapshot in UTC, AND THE Frontend SHALL display the Stale_Data_Banner showing the time of the last successful update.
3. IF the time elapsed since the capture time of the latest stored Snapshot is 10 minutes or less, THEN THE API SHALL return a response that contains no Stale_State indicator.
4. WHILE the API response includes the Stale_State indicator, THE Frontend SHALL display the Stale_Data_Banner above all airport status content.
5. WHILE the Stale_Data_Banner is displayed, THE Frontend SHALL show in the banner the capture time of the latest Snapshot, as provided by the API.
6. WHEN the Frontend completes a data refresh whose API response contains no Stale_State indicator, THE Frontend SHALL remove the Stale_Data_Banner.
7. IF no Snapshot exists in the Database, THEN THE API SHALL return a response stating that no data is available yet, with no airport status data and no Stale_State indicator, and THE Frontend SHALL display that message in place of airport status content and SHALL NOT display the Stale_Data_Banner.
8. WHILE the latest stored Snapshot is older than 10 minutes (600 seconds), THE Notifier SHALL send zero alert emails.

### Requirement 7: Manage identity without passwords

**User Story:** As a user, I want to sign in without a password, so that I can manage my watchlist without remembering credentials.

#### Acceptance Criteria

1. WHEN a visitor submits a syntactically valid email address of 254 characters or fewer, THE API SHALL create a Magic_Link and THE Notifier SHALL send it to that address through Resend.
2. THE API SHALL set each Magic_Link to expire 15 minutes after creation.
3. WHEN a User redeems a Magic_Link that is unexpired and unused, THE API SHALL create a Session that expires 30 days after creation and mark the Magic_Link as used.
4. IF a Magic_Link is expired, already used, or unknown, THEN THE API SHALL reject the request, return an error indicating the link is invalid or expired, and create no Session.
5. IF a visitor submits an email address that is syntactically invalid or longer than 254 characters, THEN THE API SHALL reject the request with a validation error, create no Magic_Link, and send no email.
6. THE API SHALL store Magic_Link tokens only as hashes in the Database.
7. THE API SHALL NOT accept, store, or prompt for a User password.
8. IF a visitor has submitted 5 Magic_Link requests for the same email address within the preceding 60 minutes, THEN THE API SHALL reject each further request for that address with a rate-limit error, create no Magic_Link, and send no email until fewer than 5 requests fall within the preceding 60 minutes.
9. WHEN a User signs out, THE API SHALL invalidate the Session so that any later request using that Session is rejected as unauthenticated.
10. IF Resend fails to accept the email for a Magic_Link, THEN THE API SHALL return an error indicating the email could not be sent and SHALL invalidate the Magic_Link that was created.
11. THE Frontend SHALL show on the sign-in page, before the email address is submitted, a notice stating that AeroBrief stores the email address only to send sign-in links and the alerts the User chooses, and that the User can delete the account and all its data at any time.

### Requirement 8: Manage the watchlist

**User Story:** As a user, I want to choose which airports I follow, so that I only receive alerts that matter to me.

#### Acceptance Criteria

1. WHEN a User with a valid Session requests to add a Monitored_Airport to the Watchlist and the Watchlist holds fewer than 10 airports, THE API SHALL add the airport to the Watchlist and return a success response that includes the updated Watchlist.
2. WHEN a User with a valid Session requests to remove an airport that is in the Watchlist, THE API SHALL remove the airport from the Watchlist and return a success response that includes the updated Watchlist.
3. IF a User with a valid Session requests to remove an airport that is not in the Watchlist, THEN THE API SHALL leave the Watchlist unchanged and return a success response that includes the unchanged Watchlist (idempotence property).
4. IF a User requests to add an airport that is not one of the 20 Monitored_Airports, THEN THE API SHALL reject the request with a validation error indicating the airport is not monitored, and THE API SHALL leave the Watchlist unchanged.
5. IF a User requests to add an airport to a Watchlist that already holds 10 airports and the airport is not already in the Watchlist, THEN THE API SHALL reject the request with an error stating the limit of 10 airports, and THE API SHALL leave the Watchlist unchanged.
6. WHEN a User requests to add an airport that is already in the Watchlist, THE API SHALL leave the Watchlist unchanged and return a success response, including when the Watchlist holds 10 airports (idempotence property).
7. IF a request to read or change a Watchlist has no Session, an expired Session, or an unrecognized Session, THEN THE API SHALL return an authentication error and SHALL NOT read or change any Watchlist.
8. FOR ALL sequences of add and remove operations, THE Watchlist size SHALL remain between 0 and 10 inclusive, and THE Watchlist SHALL contain no duplicate airports (invariant property).
9. WHEN a User with a valid Session requests deletion of the account, THE API SHALL delete the User email address, the Watchlist, and all Sessions of that User from the Database, and return a success response.
10. IF deletion of the account fails, THEN THE API SHALL return an error, and THE API SHALL leave the User email address, Watchlist, and Sessions unchanged (all-or-nothing deletion).

### Requirement 9: Send email alerts

**User Story:** As a traveler, I want an email when a watched airport enters or exits a ground stop, so that I learn about it without checking the site.

#### Acceptance Criteria

1. WHEN the Change_Detector emits a GROUND_STOP_STARTED or GROUND_STOP_ENDED Event for an airport, THE Notifier SHALL send one alert email through Resend to each User whose Watchlist contains that airport at the time the Event is emitted.
2. THE Notifier SHALL include in each alert email the airport name, the Event type, the Explanation, and the Event time expressed in UTC to the minute.
3. WHEN the Poller stores a Snapshot that contains a detected change, THE Notifier SHALL hand each resulting alert email to Resend within 120 seconds of the Snapshot being stored (Alert_Latency).
4. THE Notifier SHALL send no more than one alert email per User per Event, regardless of how many of the User's Watchlist entries match the Event.
5. IF Resend rejects an alert email or does not respond within 10 seconds, THEN THE Notifier SHALL retry the handoff up to 2 more times (3 attempts in total), SHALL begin each retry within the 120-second Alert_Latency limit, and SHALL record in the Database one final delivery outcome of either "handed off" or "failed" for that User and Event.
6. WHEN a NATIONWIDE_EVENT Event is emitted, THE Notifier SHALL send one alert email through Resend to each User with at least 1 airport in the Watchlist.
7. IF a User has 0 airports in the Watchlist when an Event is emitted, THEN THE Notifier SHALL send no alert email to that User for that Event.
8. THE Notifier SHALL include in each GROUND_STOP_STARTED and GROUND_STOP_ENDED alert email a link that, WHEN the recipient opens it, stops further alert emails for the airport named in that email to that User and displays a confirmation that names the airport.
9. FOR ALL Events processed twice because of a Poller retry, THE Notifier SHALL send no more than one alert email per User per Event (idempotence property).
10. THE Notifier SHALL deduplicate alert emails by FAA_Event_ID, together with Event type and User, so that retried polls never send a duplicate email for the same FAA event to the same User, while the GROUND_STOP_STARTED and GROUND_STOP_ENDED Events of one FAA_Event_ID each yield one email.

### Requirement 10: Display airport status

**User Story:** As a traveler, I want a clear view of all monitored airports, so that I can see current status and recent events at a glance.

#### Acceptance Criteria

1. THE Frontend SHALL display the current status of all 20 Monitored_Airports as a list or table, with one row or entry per airport, and SHALL NOT display a map.
2. WHEN the Frontend loads or refreshes data and a nationwide event is active, THE Frontend SHALL display the system-wide banner, containing the event's Explanation, above the airport list.
3. WHEN the Frontend loads or refreshes data, THE Frontend SHALL display every Event whose start time is within the previous 24 hours, each with its Explanation, ordered from most recent to oldest.
4. IF an Event started more than 24 hours before the current time, THEN THE Frontend SHALL NOT display that Event.
5. WHEN the Frontend loads or refreshes data, THE Frontend SHALL display the capture time of the latest Snapshot.
6. WHILE the Frontend page is open, THE Frontend SHALL request fresh data from the API every 60 seconds.
7. IF a data request to the API fails or does not respond within 10 seconds, THEN THE Frontend SHALL keep displaying the previously loaded data, display an error indication that the refresh failed, and retry at the next 60-second interval.
8. WHERE a User has a Session, THE Frontend SHALL visually distinguish the airports in the User Watchlist (at most 10) from the other Monitored_Airports.

### Requirement 11: Retain 24 hours of history

**User Story:** As a maintainer, I want history limited to 24 hours, so that storage stays small and the MVP scope is respected.

#### Acceptance Criteria

1. THE Database SHALL store each Snapshot and each Event with a capture or creation timestamp, and SHALL keep each record until its age exceeds 24 hours (86,400 seconds).
2. WHEN a scheduled cleanup runs, THE Poller SHALL delete every Snapshot and Event whose age is greater than 24 hours (86,400 seconds) and SHALL leave every record with an age of 24 hours or less unchanged.
3. THE API SHALL exclude every Snapshot and Event with an age greater than 24 hours (86,400 seconds) from all responses, including when cleanup has not yet removed the record.
4. THE Poller SHALL start a cleanup run at intervals of 60 minutes or less.
5. FOR ALL stored records at any time after a cleanup run completes, the age of every Snapshot and Event SHALL be at most 25 hours (24 hours plus the 60-minute maximum cleanup interval) (invariant property).
6. IF a cleanup run fails to delete records, THEN THE Poller SHALL keep all records unchanged by that failed run, SHALL record the failure, and SHALL retry the cleanup at the next scheduled interval of 60 minutes or less.
7. IF a request for history older than 24 hours is made to the API, THEN THE API SHALL return an empty result for the portion older than 24 hours and SHALL NOT return an error solely because of the age range.

### Requirement 12: Meet availability and latency targets

**User Story:** As a dispatcher, I want AeroBrief to stay available when the FAA is not, so that I can rely on it during outages.

#### Acceptance Criteria

1. THE API and THE Frontend SHALL each achieve at least 99.9% availability per calendar month (at most 43.2 minutes of downtime in a 30-day month), where availability is the percentage of one-minute synthetic health checks that receive a successful response, and FAA_API failures are not counted as downtime.
2. WHILE the FAA_API is unreachable, THE API SHALL serve every snapshot request using only data stored in the Database, make zero calls to the FAA_API while serving the request, and return the most recently stored snapshot data for each requested airport.
3. WHEN a snapshot request is received, THE API SHALL respond within 500 ms at the 95th percentile, measured at the Cloudflare edge over a rolling 24-hour window of snapshot requests.
4. WHEN the Poller detects a change that matches a user's watchlist, THE Poller SHALL store the change in the Database and hand the resulting alert email to Resend within an Alert_Latency of 120 seconds at the 99th percentile, where Alert_Latency is measured from the moment the Poller stores the Snapshot containing the change to the moment Resend accepts the email (see Assumption 1).
5. WHEN the Poller hands an alert email to Resend, THE AeroBrief SHALL record the Alert_Latency in milliseconds for that alert email in the Database, and retain the record for at least 24 hours.
6. IF the Database is unreachable, THEN THE API SHALL return a service unavailable response that includes a retry indication of 30 seconds, within 5 seconds of receiving the request, and SHALL leave stored data unchanged.
7. IF recording the Alert_Latency in the Database fails, THEN THE Poller SHALL still complete delivery of the alert email to Resend and SHALL signal the recording failure to operators.

### Requirement 13: Meet accessibility standards

**User Story:** As a user with a disability, I want the core flows to be accessible, so that I can use AeroBrief with assistive technology.

#### Acceptance Criteria

1. THE Frontend SHALL conform to WCAG 2.1 Level AA for the core flows: viewing airport status, reading the Stale_Data_Banner, signing in with a Magic_Link, and managing the Watchlist.
2. THE Frontend SHALL convey every airport status value and every Stale_Data_Banner state through visible text or an accessible text label in addition to color, so that no status is distinguishable by color alone.
3. THE Frontend SHALL allow every interactive control in the core flows to be reached and activated using only a keyboard, with no keyboard trap, a visible focus indicator on the focused control, and a focus order that follows the visual reading order.
4. WHEN the Stale_Data_Banner appears or the system-wide banner appears, THE Frontend SHALL announce its text content to assistive technology through an ARIA live region within 1 second of the element being rendered, without moving keyboard focus.
5. THE Frontend SHALL provide a color contrast ratio of at least 4.5:1 for normal text (under 18 pt, or under 14 pt bold) and at least 3:1 for large text and for user interface component boundaries and focus indicators.
6. WHEN a pull request is opened or updated, THE CI pipeline SHALL run automated accessibility checks against all four core flows and SHALL fail the build if one or more WCAG 2.1 Level AA violations are detected.
7. IF a Magic_Link sign-in attempt fails, the Magic_Link has expired, or a Watchlist action is rejected (including an attempt to add an 11th airport), THEN THE Frontend SHALL display an error message as text, announce it to assistive technology through an ARIA live region, and keep the user's entered input and current Watchlist unchanged.

### Requirement 14: Enforce stack and MVP scope

**User Story:** As a project owner, I want the build to stay within the approved stack and MVP boundaries, so that scope does not drift.

#### Acceptance Criteria

1. THE AeroBrief SHALL be implemented in TypeScript with `"strict": true` in every tsconfig file and SHALL contain zero plain JavaScript source files (`.js`, `.jsx`, `.mjs`, `.cjs`), excluding generated build output and installed dependencies.
2. THE AeroBrief SHALL run the Poller and the API as Cloudflare Workers and SHALL use no always-on server.
3. THE AeroBrief SHALL store data in Neon Postgres and SHALL access it through Drizzle ORM.
4. THE Frontend SHALL be built with React 18 and Vite and deployed on Vercel.
5. THE Notifier SHALL send email through Resend.
6. THE AeroBrief SHALL include Vitest unit tests and fast-check property-based tests.
7. WHEN a pull request is opened or updated, THE AeroBrief SHALL run type checking, the Vitest and fast-check tests, and accessibility checks in GitHub Actions.
8. THE AeroBrief SHALL include no FAA SWIM integration, push notifications, map views, native mobile apps, user passwords, or monetization.
9. THE AeroBrief SHALL obtain FAA data only from the FAA_API and SHALL NOT scrape FlightAware, Flightradar24, or any other third-party site.
10. THE AeroBrief SHALL store secrets, including the Neon connection string and the Resend API key, in Cloudflare Worker secrets, SHALL NOT commit them to source control, and SHALL NOT write them to logs.
11. IF any GitHub Actions check for a pull request fails, THEN THE AeroBrief SHALL report a failed status on that pull request.
12. THE AeroBrief SHALL monitor exactly 20 hardcoded US airports and SHALL retain history for 24 hours only.

### Requirement 15: Visual Design and Product Experience

**User Story:** As a traveler or dispatcher, I want AeroBrief to look and behave like a finished product, so that I can read airport status at a glance and trust what I see.

#### Acceptance Criteria

1. THE Frontend SHALL apply one shared set of design tokens for color, spacing, typography, corner radius, and elevation on every page.
2. THE Frontend SHALL render a site navigation bar on every page containing a link to the Status page, a link to the Watchlist page, a Sign in link WHILE the visitor has no Session, and a Sign out control WHILE the User has a Session, AND THE Frontend SHALL mark the link of the current page with `aria-current="page"`.
3. THE Frontend SHALL render a footer on every page containing the data source attribution "FAA NAS Status API", the license "MIT", and the attribution "Built with Kiro · Kiroween 2026".
4. WHEN the Status page displays a Snapshot, THE Frontend SHALL display a summary card showing the overall national status, the count of Monitored_Airports with an active Ground_Stop, the count of Affected_ARTCCs, and the capture time of the latest Snapshot.
5. THE Frontend SHALL render the status of each row in the airport status table as a status pill containing a decorative icon and the status text, SHALL use the text as the primary signal and color as decoration only, and SHALL give the pill text and pill boundary contrast ratios that meet WCAG 2.1 Level AA.
6. WHILE no filter is applied, THE Frontend SHALL render all 20 Monitored_Airports in the airport status table, ordered with every airport that has an active Ground_Stop first and then by airport identifier in ascending alphabetical order within each group.
7. WHEN the Status page displays the Events of the previous 24 hours, THE Frontend SHALL render each Event as a separate event card containing a decorative icon, the Explanation without altering its text, and the Event time, ordered from most recent to oldest.
8. WHILE a User with a Session views the Watchlist page, THE Frontend SHALL display a counter in the form "N of 10 airports watched", where N is the number of airports in the Watchlist, and SHALL show only a remove control, and no add control, for each airport already in the Watchlist, while keeping the add control of every other airport enabled when the Watchlist holds 10 airports so that Requirement 13.7 still applies.
9. THE Frontend SHALL define a visible loading state, empty state, and error state for every page, AND WHILE a page is loading its data, THE Frontend SHALL display a loading indicator with text and SHALL NOT render a blank page.
10. THE Frontend SHALL lay out every page so that all content is readable and every control is operable without horizontal page scrolling at viewport widths from 375 px to 1920 px.
11. THE Frontend SHALL implement every interactive element as a native `<button>` element or an `<a>` element with an `href`, reachable by keyboard and showing a visible focus indicator.
12. THE Frontend SHALL give every new foreground and background color pair a contrast ratio of at least 4.5:1 for normal text and at least 3:1 for large text, user interface component boundaries, and focus indicators.
13. WHEN a User reaches the Watchlist page directly after redeeming a Magic_Link, THE Frontend SHALL display a dismissible success message "Successfully signed in as <email>." containing the email address returned by the API, SHALL announce it through an ARIA live region without moving keyboard focus, AND SHALL NOT place the email address in the page URL.
14. WHEN the Status page displays a Snapshot, THE Frontend SHALL show the overall national status as exactly one of three levels: "Normal" when no Monitored_Airport has an active Ground_Stop, "Ground stops active" when at least one Monitored_Airport has an active Ground_Stop and no nationwide event is active, and "System-wide disruption" when a nationwide event is active, each with a decorative color (green, amber, and red respectively) that meets a 3:1 contrast ratio as large text.

### Requirement 16: Rotate secrets safely

**User Story:** As a maintainer, I want one command that rotates the production secrets, so that a leaked secret can be replaced quickly without breaking the live service.

#### Acceptance Criteria

1. WHEN the maintainer runs the rotation script, THE script SHALL rotate the Neon database role password, the Resend API key, and the UNSUBSCRIBE_SECRET, or only the subset selected with an `--only` option.
2. WHEN the rotation script runs with `--dry-run`, THE script SHALL print the planned steps and SHALL make no change to any external service, Worker secret, or local file.
3. THE rotation script SHALL NOT print or log the value of any secret, old or new, and SHALL write secret values only to the local `.env`, its gitignored `.env.backup` copy, and the temporary file used for the atomic rewrite of `.env`.
4. WHEN the rotation script rotates a secret, THE script SHALL update that secret on every Cloudflare Worker that uses it and in the local `.env` file.
5. WHEN the rotation script rotates the Resend API key, THE script SHALL create the new key, update the Workers, verify that the new key is accepted by Resend, and only then delete the old key.
6. IF a verification step fails after a secret was changed, THEN THE rotation script SHALL stop, report which secrets were changed and which were not, and SHALL NOT delete any old Resend key.
7. WHEN the UNSUBSCRIBE_SECRET is rotated, THE API SHALL accept unsubscribe links signed with the previous secret for 30 days after the rotation, and THE Notifier SHALL sign new links only with the current secret.
8. WHEN the 30-day period after an UNSUBSCRIBE_SECRET rotation has passed, THE API SHALL reject unsubscribe links signed only with the previous secret.

### Requirement 17: Show the cause, expected end, and official source of each ground stop

**User Story:** As a traveler or dispatcher, I want to see why an airport is stopped, how long it may last, and where the official notice is, so that I can plan and check the source myself.

#### Acceptance Criteria

1. WHILE a Monitored_Airport has an active Ground_Stop, THE Frontend SHALL show in that airport's row of the airport status table the plain-language reason text returned by the API, produced by the Explanation_Mapper rules of Requirement 5.
2. WHERE the FAA_API supplies an end time or a program expiration time for an active Ground_Stop, THE Frontend SHALL show "Expected to end around <time> UTC", using the end time when both are supplied.
3. IF the FAA_API supplies neither an end time nor a program expiration time for an active Ground_Stop, THEN THE Frontend SHALL show "Until further notice".
4. WHERE the FAA_API supplies an advisory URL for an active Ground_Stop that uses HTTPS and whose host is `faa.gov` or a subdomain of `faa.gov`, THE Frontend SHALL show a link labelled "FAA advisory" to that URL.
5. IF the advisory URL is absent, is not HTTPS, or has a host outside `faa.gov`, THEN THE API SHALL omit it, AND THE Frontend SHALL instead link to `https://nasstatus.faa.gov`.
6. THE Poller SHALL store the end time, program expiration time, and accepted advisory URL in the Snapshot without making any Snapshot that lacks them invalid, so that the round-trip property of Requirement 2.8 still holds.

### Requirement 18: Show a 24-hour timeline for one airport

**User Story:** As a traveler, I want a page for one airport, so that I can see its current status and everything that happened there in the last 24 hours.

#### Acceptance Criteria

1. THE Frontend SHALL link the airport identifier in each row of the airport status table to the page `/airport/<identifier>` for that airport.
2. WHEN a visitor opens `/airport/<identifier>` for a Monitored_Airport, THE Frontend SHALL show the airport name, its current status with the details of Requirement 17, the capture time of the latest Snapshot, and every Event for that airport whose start time is within the previous 24 hours, ordered from most recent to oldest, each with its Explanation unaltered and its time.
3. IF the identifier in `/airport/<identifier>` is not one of the 20 Monitored_Airports, THEN THE Frontend SHALL show the Not found page.
4. WHILE the API response for the airport includes the Stale_State indicator, THE Frontend SHALL display the Stale_Data_Banner on the airport page.
5. THE airport page SHALL define visible loading, empty, and error states, and SHALL request data only from the existing `/api/status/airport/:code` and `/api/history/:code` endpoints.
