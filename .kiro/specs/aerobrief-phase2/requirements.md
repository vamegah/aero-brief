# Requirements Document

## Introduction

This document specifies AeroBrief Phase 2. It is post-contest work that lives only on the git branch `phase-2`. The branch `main` is the live Kiroween 2026 submission, and the tag `mvp-contest-2026` (commit fff8374) is the rollback point. Nothing in this spec changes `main`, the tag, or the MVP spec in `.kiro/specs/aerobrief/`. Nothing merges into `main` until Kiroween 2026 judging has finished.

Phase 2 covers ten feature areas that `.kiro/steering/scope.md` allows on `phase-2` only:

1. More US airports, international hubs, and flight, tail number and route tracking.
2. Additional data sources (FlightAware, OAG, Cirium, ADS-B Exchange) through licensed APIs only.
3. SMS, Slack, PagerDuty and outbound webhooks.
4. History up to 3 years, trend analysis and machine-learning predictions.
5. Billing tiers.
6. Organization accounts, single sign-on, user provisioning, roles and audit logs.
7. Alert routing rules, escalation and daily digests.
8. API keys and multi-region hosting.
9. Drag-and-drop dashboards and white-labeling.
10. Dark mode and WCAG 2.1 AAA.

The prohibitions that scope.md keeps in Phase 2 stay in force: no scraping of any site, no push notifications to devices, no map view, no native mobile apps, no FAA SWIM, and no user passwords. Single sign-on and magic links are the only ways to sign in.

The first requirements (1 to 9) are cross-cutting. They define how Phase 2 stays reversible: every feature area sits behind its own Feature_Flag that is off by default, every schema change is a separate reversible migration run only against a Neon branch, Phase 2 Workers deploy under separate names, and the existing MVP test suite keeps passing with every flag off. Requirements 10 to 33 specify the feature areas. Requirement 34 states the sign-off gates that block implementation.

### Assumptions

1. **Flags-off equivalence.** "Behaves exactly as `main`" means that, with every Feature_Flag off, every HTTP response body, status code and header set, every email, every database write, and every rendered DOM produced on `phase-2` equals what `main` produces for the same input, and the MVP test suite passes unchanged.
2. **Tech stack.** The approved stack in `.kiro/steering/tech.md` still applies. Every technology outside it is listed in the design as a Stack_Deviation, is marked pending, and is not used until the project owner approves it.
3. **Provider terms are unknown.** The license terms, rate limits and prices of FlightAware, OAG, Cirium, ADS-B Exchange, Eurocontrol and other providers have not been reviewed. Each feature that depends on a provider waits for the review in Requirement 8.
4. **Watchlist cap.** scope.md lifts the 20-airport limit and the 24-hour history limit on `phase-2`, but not the cap of 10 airports per user Watchlist. The cap stays at 10 for a user. Whether an Organization may have a larger shared watchlist is an open question for the design.
5. **Alert latency.** The Alert_Latency definition of MVP Assumption 1 is unchanged. Alerts through new channels are measured from the moment the Poller stores the Snapshot to the moment the channel provider accepts the message.
6. **Time.** All times are UTC unless a requirement says otherwise. Digest times and quiet periods use the time zone chosen by the recipient.

## Glossary

Terms of the MVP spec (`.kiro/specs/aerobrief/requirements.md`) keep their meaning. The terms below are added.

- **Phase2**: The set of features specified in this document, implemented only on the branch `phase-2`.
- **Feature_Flag**: A named boolean setting that turns one Phase 2 feature area on or off. Every Feature_Flag defaults to off.
- **Feature_Area**: One of the ten groups in the Introduction, split into the flagged units listed in Requirement 1.
- **Flags_Off_Mode**: The state in which every Feature_Flag is off.
- **MVP_Test_Suite**: The Vitest and fast-check tests, the accessibility suite and the repo guard that exist at tag `mvp-contest-2026`.
- **Phase2_Branch_DB**: The Neon branch named `phase-2`, used for all Phase 2 migrations and data.
- **Production_DB**: The Neon database that `main` uses.
- **Migration**: One Drizzle schema change file together with its documented down migration.
- **Phase2_Deployment**: The Cloudflare Workers named `aerobrief-api-phase2` and `aerobrief-poller-phase2`, and the Vercel preview of `phase-2`.
- **Production_Deployment**: The Workers `aerobrief-api` and `aerobrief-poller` and the Vercel production site.
- **Safe_Send_Mode**: The mode in which a Phase2_Deployment sends email only to recipients on an allowlist.
- **Stack_Deviation**: A technology that is outside the approved stack and needs the project owner's approval.
- **Gate**: A review or approval that must complete before the implementation tasks that depend on it start.
- **Provider**: A third-party service that supplies data or delivers messages, such as FlightAware, OAG, Cirium, ADS-B Exchange, Eurocontrol, Twilio, Slack or PagerDuty.
- **Licensed_API**: An API that a Provider offers under a written agreement or published terms, used with a key or contract that AeroBrief holds.
- **Data_Source**: A Provider whose Licensed_API supplies flight or airport data to the Poller.
- **Airport_Catalog**: The list of airports AeroBrief can monitor. On `main` it is the 20 hardcoded airports.
- **Flight**: One scheduled or operated movement of an aircraft between two airports, identified by an airline code, flight number and date.
- **Tail_Number**: The registration mark of one aircraft.
- **Route**: An ordered pair of origin and destination airports.
- **Notification_Channel**: A way AeroBrief delivers an alert: email, SMS, Slack, PagerDuty or Webhook.
- **Webhook**: An HTTPS endpoint, registered by an Organization, that receives AeroBrief events.
- **Webhook_Signature**: An HMAC-SHA256 signature over the timestamp and body of a Webhook delivery.
- **Organization**: A group of Users with a shared account, shared settings and a shared set of Notification_Channels.
- **Member**: A User who belongs to an Organization.
- **Role**: One of `viewer`, `dispatcher` or `admin`.
- **Permission**: One action on one resource type, such as `watchlist:write` or `audit:read`.
- **SSO**: Single sign-on, where an Organization's identity provider authenticates a Member.
- **SCIM**: The System for Cross-domain Identity Management protocol that an identity provider uses to create, update and deactivate Members.
- **Audit_Log**: An append-only record of security-relevant actions in an Organization.
- **API_Key**: A secret token that identifies an Organization for programmatic API access. Only its hash is stored.
- **Rate_Limit**: The maximum number of API requests an API_Key may make in a time window.
- **Routing_Rule**: A condition-and-action pair that decides which Members receive an alert on which Notification_Channel.
- **Escalation_Policy**: An ordered list of steps that notify further recipients when an alert is not acknowledged within a set time.
- **Acknowledgement**: A recorded action by a recipient that confirms the alert was seen.
- **Digest**: A single message that summarizes the Events of a time period.
- **History_Store**: The Database tables that hold Snapshots and Events beyond 24 hours.
- **Trend_Report**: A computed summary of Event counts and durations over a chosen period.
- **Prediction**: A model output that estimates the probability or duration of a disruption, labelled as an estimate.
- **Plan**: A billing tier, which is a named set of limits and features.
- **Entitlement**: A limit or feature that a Plan grants to an Organization.
- **Dashboard**: A saved arrangement of widgets that a Member builds.
- **Widget**: One panel on a Dashboard.
- **Brand_Settings**: An Organization's logo, name, colors and sender identity used for white-labeling.
- **Theme**: A complete set of design tokens: light AA (the default), dark AA, and AAA variants.
- **AAA_Theme**: The Theme in which every text pair has a contrast ratio of at least 7:1 and every large text pair at least 4.5:1.
- **Region**: A Cloudflare and Neon location in which AeroBrief runs.

## Requirements

### Requirement 1: Gate every feature area behind its own flag

**User Story:** As a maintainer, I want every Phase 2 feature behind its own flag that is off by default, so that I can turn one feature off without affecting the others or the MVP.

#### Acceptance Criteria

1. THE AeroBrief SHALL define one Feature_Flag for each of these units: `FEATURE_EXPANDED_AIRPORTS`, `FEATURE_FLIGHT_TRACKING`, `FEATURE_EXTRA_SOURCES`, `FEATURE_CHANNELS` (SMS, Slack and PagerDuty), `FEATURE_WEBHOOKS`, `FEATURE_EXTENDED_HISTORY`, `FEATURE_TRENDS`, `FEATURE_PREDICTIONS`, `FEATURE_BILLING`, `FEATURE_ORGS`, `FEATURE_SSO`, `FEATURE_SCIM`, `FEATURE_RBAC`, `FEATURE_AUDIT_LOG`, `FEATURE_ALERT_ROUTING`, `FEATURE_ESCALATION`, `FEATURE_DIGESTS`, `FEATURE_API_KEYS`, `FEATURE_MULTI_REGION`, `FEATURE_DASHBOARDS`, `FEATURE_WHITE_LABEL`, `FEATURE_DARK_MODE` and `FEATURE_AAA`.
2. WHEN a Worker starts, THE Worker SHALL validate every Feature_Flag value with a Zod schema and SHALL read an absent flag as off.
3. IF a Feature_Flag value is present and is not a recognized boolean string, THEN THE Worker SHALL fail startup with an error that names the flag and SHALL NOT start with a guessed value.
4. THE AeroBrief SHALL treat every Feature_Flag as off unless its value is explicitly set to on in the environment of that deployment.
5. WHERE a Feature_Flag depends on another Feature_Flag, THE AeroBrief SHALL treat the dependent flag as off while the flag it depends on is off, and SHALL record the dependency list in one table in the source code.
6. WHILE a Feature_Flag is off, THE API SHALL answer every request to an endpoint that belongs only to that feature area with the same `404` response as an unknown route.
7. WHILE a Feature_Flag is off, THE Poller SHALL run no job, make no external request and write no row that belongs only to that feature area.
8. WHILE a Feature_Flag is off, THE Frontend SHALL render no navigation link, page, control or text that belongs only to that feature area.
9. THE Frontend SHALL learn the state of each Feature_Flag from the deployment it runs on, and SHALL NOT use a client-side value that a visitor can change to turn a feature on.
10. FOR ALL combinations of Feature_Flag values, THE flag evaluation function SHALL return a state in which every dependent flag is off whenever one of its dependencies is off (invariant property).

### Requirement 2: Preserve MVP behavior with every flag off

**User Story:** As a maintainer, I want `phase-2` with all flags off to behave exactly as `main`, so that a flag-off rollback returns the contest MVP.

#### Acceptance Criteria

1. WHILE Flags_Off_Mode applies, THE AeroBrief SHALL pass the MVP_Test_Suite on `phase-2` with no test file edited, deleted or skipped for that run.
2. WHEN a pull request or push targets `phase-2`, THE CI pipeline SHALL run the MVP_Test_Suite in Flags_Off_Mode as a required check.
3. WHILE Flags_Off_Mode applies, THE AeroBrief SHALL produce HTTP response bodies, status codes, emails, database writes and rendered DOM equal to those that `main` produces for the same input.
4. THE AeroBrief SHALL implement every change to a repo guard or MVP test so that it takes effect only when the related Feature_Flag is on, or only on the branch `phase-2`, and so that the unchanged test still passes in Flags_Off_Mode.
5. WHEN a task section of the Phase 2 plan finishes, THE plan SHALL include a checkpoint that runs the MVP_Test_Suite in Flags_Off_Mode.
6. IF the MVP_Test_Suite fails in Flags_Off_Mode, THEN THE CI pipeline SHALL report a failed status on the pull request or push and SHALL block the merge into `phase-2`.
7. FOR ALL Feature_Flag states in which every flag is off, THE configuration loaded by each Worker SHALL equal the configuration `main` loads (equivalence property).

### Requirement 3: Make every schema change reversible and isolated

**User Story:** As a maintainer, I want each schema change to be its own reversible migration run only on a Neon branch, so that the production database is never at risk.

#### Acceptance Criteria

1. THE AeroBrief SHALL implement each Phase 2 schema change as its own Migration that touches the tables of one feature area only.
2. THE AeroBrief SHALL store with each Migration a documented down migration that restores the schema to the state before that Migration.
3. THE AeroBrief SHALL write each Migration as additive where possible: new tables, new nullable columns, new indexes, and new columns with defaults.
4. IF a Migration changes or removes an existing MVP column, table, constraint or trigger, THEN THE Migration SHALL be recorded in the design with the reason additive change is not possible and with a data-preserving down migration.
5. THE AeroBrief SHALL run Phase 2 Migrations only against the Phase2_Branch_DB.
6. IF the database connection string given to a Migration command does not identify the Phase2_Branch_DB, THEN THE migration command SHALL stop before it runs any statement and SHALL report which target it refused.
7. THE AeroBrief SHALL run no Phase 2 Migration against the Production_DB before the merge into `main` is approved.
8. WHEN a Migration is applied and then its down migration is applied on a copy of the Phase2_Branch_DB, THE resulting schema SHALL equal the schema before the Migration (round-trip property).
9. THE MVP tables `airports`, `snapshots`, `events`, `subscriptions`, `alert_log`, `users`, `sessions`, `magic_links`, `job_runs` and `poller_lease` SHALL keep every existing column, type and constraint in Flags_Off_Mode.

### Requirement 4: Deploy Phase 2 separately from production

**User Story:** As a maintainer, I want Phase 2 Workers and the Phase 2 web preview to run apart from production, so that experiments never reach live users.

#### Acceptance Criteria

1. THE AeroBrief SHALL deploy the Phase 2 API as the Worker `aerobrief-api-phase2` and the Phase 2 Poller as the Worker `aerobrief-poller-phase2`, using a separate wrangler environment for each.
2. THE Phase2_Deployment SHALL use its own Worker secrets, its own cron triggers and the Phase2_Branch_DB, and SHALL share no secret value with the Production_Deployment.
3. THE AeroBrief SHALL leave the workflow `.github/workflows/deploy-workers.yml` unchanged, so that the workflow still deploys only on pushes to `main`.
4. THE AeroBrief SHALL deploy the Phase2_Deployment from a separate workflow that runs only on the branch `phase-2` and deploys only the Worker names in criterion 1.
5. IF a deploy job on `phase-2` resolves a Worker name that equals `aerobrief-api` or `aerobrief-poller`, THEN THE deploy job SHALL fail before it deploys.
6. WHEN Vercel builds a preview of `phase-2`, THE Frontend preview SHALL send `/api/*` requests to the `aerobrief-api-phase2` Worker and SHALL NOT send them to the Production_Deployment API.
7. THE Vercel production deployment SHALL keep its `/api/*` rewrite to the Production_Deployment API.
8. THE Phase2_Deployment SHALL NOT use the production `UNSUBSCRIBE_SECRET`, Resend API key or database role.
9. THE AeroBrief SHALL document in the design the steps that return the system to the contest MVP: turn the flag off, revert the commits of the feature on `phase-2`, or delete the branch.

### Requirement 5: Send no real alerts from Phase 2 environments

**User Story:** As a maintainer, I want the Phase 2 Poller to be unable to email production users, so that testing never reaches real people.

#### Acceptance Criteria

1. THE Phase2_Deployment SHALL run in Safe_Send_Mode.
2. WHILE Safe_Send_Mode applies, THE Notifier SHALL send a message only to a recipient address on the allowlist, or to a Resend test address.
3. IF a recipient is not on the allowlist, THEN THE Notifier SHALL skip that recipient, record the skip with the reason "not allowlisted", and make no call to the Notification_Channel Provider for that recipient.
4. WHILE Safe_Send_Mode applies, THE Notifier SHALL apply the same allowlist rule to SMS numbers, Slack destinations, PagerDuty services and Webhook URLs.
5. THE Phase2_Branch_DB SHALL hold no copy of production Users, email addresses or Sessions.
6. IF the Phase2_Deployment starts without an allowlist value, THEN THE Worker SHALL treat the allowlist as empty and SHALL send no message.
7. FOR ALL recipient lists and allowlists, THE recipient filter SHALL return only recipients on the allowlist and SHALL never return a recipient that is not on it (invariant property).

### Requirement 6: Keep feature areas independently removable

**User Story:** As a maintainer, I want each feature area implemented in its own commits, so that I can remove one without touching the others.

#### Acceptance Criteria

1. THE Phase 2 plan SHALL contain one task section per Feature_Area, ordered from lowest risk to highest risk.
2. THE Phase 2 plan SHALL state the dependencies between task sections, including that Organization accounts come before RBAC, SSO, SCIM and the Audit_Log, that API keys come before customer-facing Webhooks, and that billing comes last and waits for the legal review in Requirement 8.
3. THE AeroBrief SHALL implement each Feature_Area in commits that touch no code of another Feature_Area, except through the shared flag, migration and test helpers.
4. WHEN a Feature_Flag is turned off and the commits of its Feature_Area are reverted on `phase-2`, THE remaining Feature_Areas SHALL build and pass their tests.
5. IF a Feature_Area fails its checkpoint, THEN THE maintainer SHALL turn its flag off and revert its commits on `phase-2`, without reverting any other Feature_Area.

### Requirement 7: Enforce the merge embargo and prohibitions

**User Story:** As a project owner, I want nothing from Phase 2 to reach `main` until judging ends, and I want the prohibited items to stay out, so that the contest build is safe.

#### Acceptance Criteria

1. THE AeroBrief SHALL merge no Phase 2 commit into `main` and SHALL move no tag `mvp-contest-2026` until Kiroween 2026 judging has finished and the project owner has approved the merge.
2. THE AeroBrief SHALL fetch data only from the FAA_API and from Licensed_APIs of Providers that completed the Requirement 8 review, and SHALL NOT scrape any site.
3. THE AeroBrief SHALL include no push notifications to devices, no map view, no native mobile app, no FAA SWIM integration and no user password.
4. THE AeroBrief SHALL authenticate Users only with Magic_Links and, for Organizations that enable it, SSO.
5. THE repo guard SHALL fail the build if a database schema file declares a password-like column, a package manifest lists a push-notification or map library, or a source file imports a SWIM client.
6. IF a request would break a prohibition in this requirement, THEN THE AeroBrief team SHALL refuse it and name the prohibition, and SHALL NOT implement a partial or workaround version.

### Requirement 8: Complete legal, licensing and cost gates before dependent work

**User Story:** As a project owner, I want provider licenses and data terms reviewed before any dependent code, so that AeroBrief never uses data it may not use.

#### Acceptance Criteria

1. THE Phase 2 plan SHALL contain a Gate task for the license and terms review of each Provider: FlightAware, OAG, Cirium, ADS-B Exchange, Eurocontrol, and every other international data Provider the design names.
2. THE Phase 2 plan SHALL contain a Gate task for the review of the FAA data terms for commercial use, and SHALL place it before every billing implementation task.
3. THE Phase 2 plan SHALL contain a Gate task for the review of the terms of each message Provider that sends on behalf of AeroBrief: the SMS Provider, Slack and PagerDuty.
4. THE Phase 2 plan SHALL contain a Gate task for data-protection review of Organization data, SSO and SCIM data, and Audit_Log data, covering what is stored, the retention period, deletion on request and the regions where data is held.
5. THE design SHALL record, for each Provider, a cost estimate taken from the Provider's official published pricing with a source link, and SHALL state "unknown" where the Provider publishes no price.
6. WHILE the Gate of a Provider has not completed, THE AeroBrief SHALL hold no implementation task that calls that Provider's API outside a test double, and SHALL hold no Provider key or contract in any environment.
7. IF a Provider's terms forbid a planned use, THEN THE project owner SHALL decide whether to drop the use or the Provider, and THE plan SHALL mark the dependent tasks as blocked until that decision is recorded.
8. THE Phase 2 plan SHALL mark each task that is blocked on a Gate or an approval, and SHALL name the blocker.

### Requirement 9: Control stack deviations

**User Story:** As a project owner, I want every technology outside the approved stack flagged and approved before use, so that the stack does not drift.

#### Acceptance Criteria

1. THE design SHALL list every Stack_Deviation in a table with these columns: technology, feature, why needed, in-stack option considered, and status.
2. THE design SHALL mark every Stack_Deviation as pending until the project owner approves it in writing in the spec or in the conversation.
3. WHILE a Stack_Deviation is pending, THE AeroBrief SHALL add no package, SDK, account or service for it, and SHALL implement only the parts of its feature that run on the approved stack.
4. IF the project owner declines a Stack_Deviation, THEN THE design SHALL name the in-stack fallback or SHALL mark the dependent feature as dropped.
5. THE design SHALL list at least these candidates: an SMS Provider, the Slack API, the PagerDuty Events API, FlightAware AeroAPI, OAG, Cirium, ADS-B Exchange, Eurocontrol or ICAO data, a billing Provider, an SSO and SCIM Provider or SAML library, a machine-learning runtime, a multi-region database option, and a drag-and-drop approach.
6. THE repo guard SHALL fail the build if a package manifest lists a dependency that is on the pending list.

### Requirement 10: Expand the airport catalog

**User Story:** As a dispatcher, I want AeroBrief to cover more US airports and international hubs, so that I can monitor my whole network.

#### Acceptance Criteria

1. WHERE `FEATURE_EXPANDED_AIRPORTS` is on, THE Airport_Catalog SHALL contain every airport in a catalog file in `packages/core`, and the catalog SHALL include the 20 MVP airports unchanged.
2. WHILE `FEATURE_EXPANDED_AIRPORTS` is off, THE Airport_Catalog SHALL contain exactly the 20 MVP airports.
3. THE Airport_Catalog SHALL record for each airport its identifier, name, country, region or ARTCC where one applies, and the Data_Source that covers it.
4. WHEN the Poller normalizes an FAA_API response and `FEATURE_EXPANDED_AIRPORTS` is on, THE Poller SHALL store a status entry for each airport in the Airport_Catalog that the FAA_API covers.
5. WHERE an airport is outside FAA coverage, THE Poller SHALL fill its status only from a Data_Source whose Gate has completed, and SHALL record the Data_Source name on the status entry.
6. WHEN the Frontend shows an airport that has no status because no Data_Source covers it, THE Frontend SHALL show the text "No data source for this airport".
7. WHILE `FEATURE_EXPANDED_AIRPORTS` is on, THE Frontend SHALL let a User search the catalog by identifier, name and country.
8. THE API SHALL return the same Watchlist cap of 10 airports per User for the expanded catalog.
9. IF an airport identifier is not in the active Airport_Catalog, THEN THE API SHALL reject a request to add it to a Watchlist with a validation error and SHALL leave the Watchlist unchanged.
10. FOR ALL Airport_Catalog files, THE catalog validator SHALL accept the file only if every identifier is unique and every entry has a name and a country (invariant property).

### Requirement 11: Track flights, tail numbers and routes

**User Story:** As an airline operations user, I want to follow a flight, a tail number or a route, so that I can see whether a disruption affects it.

#### Acceptance Criteria

1. WHERE `FEATURE_FLIGHT_TRACKING` is on, THE API SHALL let a signed-in User follow one Flight, one Tail_Number or one Route.
2. THE AeroBrief SHALL obtain Flight, Tail_Number and Route data only from a Data_Source whose Gate has completed.
3. WHEN a User follows a Flight, Tail_Number or Route, THE API SHALL validate the identifier with a Zod schema and SHALL reject an invalid identifier with a validation error.
4. WHEN a followed Flight's origin or destination airport has an active Ground_Stop, THE Notifier SHALL send one alert per followed item per Event, naming the Flight, Tail_Number or Route.
5. THE API SHALL limit each User to 10 followed items in total across Flights, Tail_Numbers and Routes.
6. THE Frontend SHALL show for each followed item its status as text, the airports involved, the Data_Source name and the time of the last update.
7. IF the Data_Source is unavailable, THEN THE Frontend SHALL show the last stored status with a stale notice and the time of the last update, and SHALL NOT show an empty or error-only page.
8. THE Poller SHALL query a Data_Source only for items that at least one User follows, to stay within the Data_Source's rate limits and cost.
9. FOR ALL sets of followed items and Events, THE alert recipient selector SHALL return each User at most once per Event (idempotence property).

### Requirement 12: Add licensed data sources

**User Story:** As a dispatcher, I want AeroBrief to use more than one data source, so that I can still see status when the FAA feed is wrong or down.

#### Acceptance Criteria

1. WHERE `FEATURE_EXTRA_SOURCES` is on, THE Poller SHALL fetch data from each enabled Data_Source on that Data_Source's schedule, using only its Licensed_API with a key held in a Worker secret.
2. THE Poller SHALL validate each Data_Source response with a Zod schema before it writes anything, and SHALL record a failed poll with a reason when validation fails.
3. THE Poller SHALL make requests to a Data_Source only within that Data_Source's published rate limits.
4. WHEN two Data_Sources report different statuses for one airport, THE Poller SHALL apply a documented precedence rule, SHALL store both reports with their Data_Source names, and SHALL show the Data_Source that decided the status.
5. WHEN the FAA_API poll fails and another Data_Source reports status for an airport, THE API SHALL return that status labelled with the Data_Source name and the capture time.
6. THE Frontend SHALL show the Data_Source name next to any status that does not come from the FAA_API.
7. IF a Data_Source returns a response that violates its terms of use, such as redistribution of data that the license forbids, THEN THE API SHALL NOT expose that data field to any User.
8. THE AeroBrief SHALL scrape no web page of any Data_Source or other site.
9. FOR ALL pairs of Data_Source reports for one airport, THE precedence function SHALL return the same winner regardless of the order of the two reports (confluence property).

### Requirement 13: Deliver alerts by SMS, Slack and PagerDuty

**User Story:** As a dispatcher, I want alerts by SMS, Slack and PagerDuty, so that I see a ground stop in the tool my team already watches.

#### Acceptance Criteria

1. WHERE `FEATURE_CHANNELS` is on, THE Notifier SHALL deliver an alert through each Notification_Channel that the recipient has verified and enabled.
2. WHEN a User adds an SMS number, THE API SHALL send a verification code to that number and SHALL enable the number only after the User submits the correct code within 15 minutes.
3. WHEN a User or an Organization admin connects Slack or PagerDuty, THE API SHALL store the credential in encrypted form and SHALL send a test message before it enables the channel.
4. THE Notifier SHALL include in each message on any Notification_Channel the airport name, the Event type, the Explanation unaltered, and the Event time in UTC to the minute.
5. THE Notifier SHALL deduplicate deliveries per FAA_Event_ID, Event type, recipient and Notification_Channel, so that a retried poll sends no second message on the same channel.
6. IF a Provider rejects a message or does not respond within 10 seconds, THEN THE Notifier SHALL retry up to 2 more times and SHALL record one final outcome of "handed off" or "failed".
7. THE Notifier SHALL limit SMS messages to 20 per User per day, and SHALL record the skipped messages with the reason "daily SMS limit".
8. WHEN a recipient replies STOP to an SMS or removes the Slack app or PagerDuty integration, THE API SHALL disable that Notification_Channel for that recipient.
9. IF a message body exceeds the channel's length limit, THEN THE Notifier SHALL shorten the Explanation by a documented rule that keeps the airport name and Event type, and SHALL include a link to the full Explanation.
10. THE Notifier SHALL NOT send a message when the latest Snapshot is older than 10 minutes, as MVP Requirement 6.8 states for email.
11. FOR ALL Events and channel length limits, THE message formatter SHALL return text within the limit that contains the airport name and Event type (invariant property).

### Requirement 14: Send signed outbound webhooks

**User Story:** As an integrator, I want AeroBrief to post events to my HTTPS endpoint with a signature, so that I can verify each request came from AeroBrief.

#### Acceptance Criteria

1. WHERE `FEATURE_WEBHOOKS` is on, THE API SHALL let an Organization admin register a Webhook URL, and SHALL accept only URLs that use HTTPS and whose host is not a private, loopback or link-local address.
2. WHEN an Event occurs that matches a Webhook subscription, THE Notifier SHALL send one HTTP POST with a JSON body to the Webhook URL.
3. THE Notifier SHALL sign each delivery with a Webhook_Signature using a per-Webhook secret, and SHALL send the timestamp and the signature in request headers.
4. THE AeroBrief SHALL generate each Webhook secret with at least 32 random bytes, show it once at creation, and store only an encrypted or hashed form.
5. IF the Webhook endpoint returns a non-2xx status or does not respond within 10 seconds, THEN THE Notifier SHALL retry with increasing delays up to 5 attempts and SHALL record the final outcome.
6. IF a Webhook fails on 20 consecutive deliveries, THEN THE Notifier SHALL disable that Webhook and SHALL notify the Organization admins.
7. THE Notifier SHALL include a unique delivery identifier in each Webhook delivery, and SHALL send the same identifier on every retry of that delivery.
8. THE Notifier SHALL deliver customer-facing Webhooks only after `FEATURE_API_KEYS` and `FEATURE_ORGS` are on.
9. FOR ALL Webhook bodies, secrets and timestamps, THE signature verifier SHALL accept a delivery signed by `sign(secret, timestamp, body)` and SHALL reject a delivery whose body, timestamp or signature was changed (round-trip property).
10. FOR ALL Webhook URLs, THE URL validator SHALL reject every URL whose host resolves to a private, loopback or link-local range (error condition property).

### Requirement 15: Offer API keys with rate limits

**User Story:** As an integrator, I want an API key for my Organization, so that my systems can read AeroBrief data programmatically within clear limits.

#### Acceptance Criteria

1. WHERE `FEATURE_API_KEYS` is on, THE API SHALL let an Organization admin create, list and revoke API_Keys.
2. WHEN an API_Key is created, THE API SHALL show the full key once and SHALL store only a hash of it.
3. WHEN a request carries an API_Key, THE API SHALL authenticate the Organization, apply that key's Rate_Limit and SHALL record the request count.
4. IF a request carries a revoked, unknown or malformed API_Key, THEN THE API SHALL reject it with an authentication error and SHALL serve no data.
5. IF an API_Key exceeds its Rate_Limit, THEN THE API SHALL reject the request with HTTP status 429 and a `Retry-After` header that gives the seconds until the window resets.
6. THE API SHALL give each API_Key the Rate_Limit of the Organization's Plan, and a fixed default Rate_Limit while `FEATURE_BILLING` is off.
7. THE API SHALL give an API_Key read access only to the endpoints that serve stored data, and no access to watchlist, account or admin endpoints.
8. THE API SHALL accept an API_Key only in a request header, and SHALL NOT accept it in a URL query string.
9. THE API SHALL NOT write an API_Key value to any log.
10. FOR ALL request sequences with timestamps, THE rate limiter SHALL allow at most the configured number of requests in any window and SHALL allow a request again once the window has passed (invariant property).

### Requirement 16: Keep history up to 3 years

**User Story:** As an analyst, I want AeroBrief to keep history for up to 3 years, so that I can study past disruptions.

#### Acceptance Criteria

1. WHERE `FEATURE_EXTENDED_HISTORY` is on, THE History_Store SHALL keep each Event and each daily Snapshot summary for 3 years (1,095 days) from its creation.
2. WHILE `FEATURE_EXTENDED_HISTORY` is off, THE AeroBrief SHALL keep and serve history for 24 hours only, as MVP Requirement 11 states.
3. WHEN the cleanup job runs and `FEATURE_EXTENDED_HISTORY` is on, THE Poller SHALL delete every History_Store record older than 3 years and SHALL leave every newer record unchanged.
4. THE API SHALL serve history through paged endpoints with a documented maximum page size and SHALL reject a query range longer than 3 years with a validation error.
5. THE Poller SHALL store the full-resolution Snapshots for 24 hours and SHALL roll older data into the History_Store as Events and hourly or daily summaries, so that storage stays bounded.
6. WHEN a User requests history older than 24 hours and `FEATURE_EXTENDED_HISTORY` is off, THE API SHALL return an empty result for that portion, as MVP Requirement 11.7 states.
7. THE Frontend SHALL show a CSV export of a chosen history range that applies the formula-injection rule of MVP Requirement 18.7.
8. IF a cleanup run fails, THEN THE Poller SHALL keep all records unchanged by that run, SHALL record the failure and SHALL retry at the next scheduled interval.
9. THE design SHALL state the retention rule for personal data inside history and SHALL state the effect of a User deleting an account on the History_Store.
10. FOR ALL records and times, THE retention partition function SHALL assign a record to "keep" if its age is at most the retention period and to "delete" otherwise, and SHALL assign each record to exactly one of the two sets (invariant property).

### Requirement 17: Report trends

**User Story:** As an analyst, I want trend reports, so that I can see which airports have the most and longest ground stops.

#### Acceptance Criteria

1. WHERE `FEATURE_TRENDS` is on, THE API SHALL return a Trend_Report for a chosen airport and period that holds the count of ground stops, the total and median duration, and the count per hour of day and per day of week.
2. THE Trend_Report SHALL be computed only from stored Events.
3. WHEN a ground stop has a start Event and no end Event, THE Trend_Report SHALL count it and SHALL report its duration as open, and SHALL NOT invent an end time.
4. THE Frontend SHALL show each Trend_Report with a text table and a text summary, and SHALL give any chart the same data in a table.
5. THE API SHALL return a Trend_Report within 2 seconds at the 95th percentile for a period of up to 1 year.
6. IF the chosen period is longer than the stored history, THEN THE API SHALL return the report for the stored part and SHALL state the actual covered period.
7. FOR ALL lists of Events, THE trend function SHALL return counts that sum to the number of distinct ground stops in the list (invariant property).
8. FOR ALL lists of Events, THE trend function SHALL return the same result for any ordering of the input list (confluence property).

### Requirement 18: Offer labelled predictions

**User Story:** As a dispatcher, I want an estimate of how likely a ground stop is and how long it may last, so that I can prepare, knowing it is only an estimate.

#### Acceptance Criteria

1. WHERE `FEATURE_PREDICTIONS` is on and `FEATURE_EXTENDED_HISTORY` is on, THE API SHALL return a Prediction for an airport.
2. THE Frontend SHALL label every Prediction with the text "Estimate, not an FAA forecast", the model version, the time the Prediction was made and the data it used.
3. THE API SHALL return a Prediction only when the History_Store holds at least the minimum number of Events that the design states for that airport.
4. IF the History_Store holds fewer Events than that minimum, THEN THE API SHALL return the message "Not enough history for an estimate" and no number.
5. THE AeroBrief SHALL train and evaluate each model offline on stored Events and SHALL record the evaluation metrics with the model version.
6. THE AeroBrief SHALL NOT send an alert or change an Event based on a Prediction.
7. THE AeroBrief SHALL use no personal data as a model input.
8. IF the model runtime is unavailable, THEN THE API SHALL return the last stored Prediction with its time, or the message "Estimate unavailable".
9. FOR ALL inputs, THE Prediction function SHALL return a probability between 0 and 1 inclusive, and a duration that is zero or greater (invariant property).

### Requirement 19: Offer billing tiers

**User Story:** As a project owner, I want billing tiers, so that AeroBrief can cover provider costs after the contest.

#### Acceptance Criteria

1. WHERE `FEATURE_BILLING` is on, THE AeroBrief SHALL define Plans with named Entitlements, including the maximum number of Members, API_Keys, Notification_Channels, followed items, Dashboard count, history range and the Rate_Limit.
2. THE AeroBrief SHALL implement billing only after the FAA commercial-use review and the license review of each Data_Source used by a paid feature have completed.
3. WHEN an Organization's Plan changes, THE API SHALL apply the new Entitlements to that Organization from the time the billing Provider confirms the change.
4. WHEN an Organization exceeds an Entitlement, THE API SHALL reject the action that exceeds it with an error that names the Entitlement and the Plan that includes more, and SHALL leave existing data unchanged.
5. IF the billing Provider's webhook cannot be verified, THEN THE API SHALL reject it and SHALL NOT change any Plan.
6. THE AeroBrief SHALL store no card number and no card data, and SHALL hand payment entry to the billing Provider's hosted page.
7. THE Frontend SHALL show the Organization's current Plan, its Entitlements and its use of each Entitlement as text.
8. WHILE `FEATURE_BILLING` is off, THE AeroBrief SHALL apply no Entitlement limit other than the limits that `main` applies.
9. IF a payment fails, THEN THE API SHALL keep the Organization's data, SHALL move the Organization to the free Plan after a documented grace period, and SHALL notify the Organization admins.
10. FOR ALL Plans and usage counts, THE entitlement check function SHALL allow an action if and only if the usage after the action is within the Plan's Entitlement (invariant property).

### Requirement 20: Provide organization accounts

**User Story:** As a team lead, I want an Organization account, so that my team shares settings, channels and billing.

#### Acceptance Criteria

1. WHERE `FEATURE_ORGS` is on, THE API SHALL let a signed-in User create an Organization and SHALL make that User its first admin.
2. WHEN an admin invites an email address, THE API SHALL send a single-use invitation link that expires after 7 days, and SHALL add the invited User as a Member when the link is redeemed.
3. THE API SHALL let a User belong to more than one Organization, and SHALL scope every Organization resource to exactly one Organization.
4. IF a request names an Organization resource that belongs to a different Organization than the caller's, THEN THE API SHALL return the same response as for a missing resource.
5. WHEN an admin removes a Member, THE API SHALL end that Member's access to the Organization's resources at once and SHALL keep the Member's personal account.
6. WHEN an Organization is deleted, THE API SHALL delete the Organization's settings, Members' links, API_Keys, Webhooks, Dashboards and Brand_Settings, and SHALL delete the Audit_Log only after its retention period.
7. THE API SHALL keep at least one admin in every Organization, and SHALL reject an action that removes or demotes the last admin.
8. IF an invitation link is expired, used or unknown, THEN THE API SHALL reject it and SHALL add no Member.
9. WHILE `FEATURE_ORGS` is off, THE API SHALL behave as `main` for personal accounts, with the same Watchlist cap of 10 airports.

### Requirement 21: Sign in with SSO

**User Story:** As an Organization admin, I want my Members to sign in through our identity provider, so that access follows our central account rules.

#### Acceptance Criteria

1. WHERE `FEATURE_SSO` is on and `FEATURE_ORGS` is on, THE API SHALL let an Organization admin configure one identity provider connection for the Organization.
2. WHEN a Member signs in through the Organization's SSO connection and the identity provider returns a valid, signed assertion, THE API SHALL create a Session for that Member.
3. THE API SHALL verify the signature, issuer, audience, validity period and the request identifier of every assertion, and SHALL accept each assertion once.
4. IF an assertion fails verification, is expired, or was already used, THEN THE API SHALL reject it and SHALL create no Session.
5. THE API SHALL map an assertion to a Member by the verified email address and the Organization's verified domain.
6. WHERE an Organization enforces SSO, THE API SHALL reject Magic_Link sign-in for email addresses on that Organization's verified domain.
7. THE API SHALL NOT accept, store or prompt for a password on any sign-in path.
8. WHEN an admin turns SSO enforcement on, THE API SHALL require the admin to confirm a successful SSO test sign-in first, so that the admin is not locked out.
9. THE API SHALL record each SSO sign-in success and failure in the Audit_Log when `FEATURE_AUDIT_LOG` is on.

### Requirement 22: Provision users with SCIM

**User Story:** As an identity administrator, I want our identity provider to create and deactivate AeroBrief Members automatically, so that departures lose access without manual work.

#### Acceptance Criteria

1. WHERE `FEATURE_SCIM` is on and `FEATURE_SSO` is on, THE API SHALL expose a SCIM endpoint for the Organization that accepts requests carrying the Organization's SCIM bearer token.
2. THE API SHALL store only a hash of each SCIM bearer token, show it once at creation and let an admin rotate it.
3. WHEN the identity provider creates a user, THE API SHALL create a Member with the Role `viewer` unless the SCIM group mapping assigns another Role.
4. WHEN the identity provider deactivates a user, THE API SHALL end all Sessions of that Member in the Organization and SHALL block new sign-in for that Member within 60 seconds.
5. IF a SCIM request has no bearer token, an unknown token or an invalid body, THEN THE API SHALL reject it with the SCIM error format and SHALL change no Member.
6. THE API SHALL apply each SCIM create or update request idempotently, so that sending the same request twice leaves one Member.
7. THE API SHALL record each SCIM action in the Audit_Log when `FEATURE_AUDIT_LOG` is on.
8. THE API SHALL return `404` for the SCIM endpoint WHILE `FEATURE_SCIM` is off.
9. FOR ALL sequences of SCIM create, update and deactivate requests, THE provisioning function SHALL leave at most one Member per external identifier in the Organization (invariant property).

### Requirement 23: Enforce roles and permissions

**User Story:** As an Organization admin, I want viewer, dispatcher and admin roles, so that each Member can do only what the job needs.

#### Acceptance Criteria

1. WHERE `FEATURE_RBAC` is on and `FEATURE_ORGS` is on, THE API SHALL assign each Member exactly one Role: `viewer`, `dispatcher` or `admin`.
2. THE API SHALL grant the Role `viewer` read access to status, history and Dashboards, and no write access to Organization settings.
3. THE API SHALL grant the Role `dispatcher` the Permissions of `viewer` plus the Permissions to manage Watchlists, followed items, Routing_Rules, Escalation_Policies, Acknowledgements and Dashboards.
4. THE API SHALL grant the Role `admin` every Permission, including Members, Roles, SSO, SCIM, API_Keys, Webhooks, Notification_Channels, billing, Brand_Settings and Audit_Log read access.
5. WHEN a request needs a Permission that the caller's Role lacks, THE API SHALL reject it with an authorization error and SHALL change nothing.
6. THE API SHALL check the Permission on the server for every Organization endpoint, and SHALL NOT rely on the Frontend to hide a control.
7. THE Frontend SHALL show a control only to a Member whose Role has its Permission, and SHALL show a text reason in place of a disabled control that the Member lacks the Permission for.
8. WHILE `FEATURE_RBAC` is off and `FEATURE_ORGS` is on, THE API SHALL treat every Member as an admin.
9. WHEN an admin changes a Member's Role, THE API SHALL apply the new Role to that Member's next request.
10. FOR ALL Roles and Permissions, THE permission check function SHALL grant `admin` every Permission, and SHALL grant `dispatcher` a superset of the Permissions of `viewer` (invariant property).
11. FOR ALL Roles, Permissions and Organization identifiers, THE permission check function SHALL deny any Permission on an Organization of which the caller is not a Member (error condition property).

### Requirement 24: Keep an audit log

**User Story:** As a security officer, I want a tamper-evident record of who did what, so that I can investigate an incident.

#### Acceptance Criteria

1. WHERE `FEATURE_AUDIT_LOG` is on and `FEATURE_ORGS` is on, THE API SHALL write one Audit_Log entry for each of these actions: sign-in and sign-out, failed sign-in, Role change, Member add and remove, SSO and SCIM configuration change, API_Key create and revoke, Webhook create, change and delete, Notification_Channel change, Routing_Rule and Escalation_Policy change, Plan change, Brand_Settings change, and Audit_Log export.
2. THE Audit_Log entry SHALL contain the time in UTC, the acting Member or system actor, the action, the target resource, the outcome and the request identifier.
3. THE Audit_Log entry SHALL NOT contain a secret, a token, an API_Key value or a full message body.
4. THE AeroBrief SHALL make the Audit_Log append-only, so that no API endpoint and no Worker code updates or deletes an entry before its retention period ends.
5. THE AeroBrief SHALL chain each entry to the previous entry of the same Organization with a hash, so that a change to an earlier entry is detectable.
6. THE API SHALL let a Member with the Permission `audit:read` list and export the Audit_Log of that Member's Organization only.
7. THE AeroBrief SHALL keep Audit_Log entries for the retention period that the data-protection review in Requirement 8 sets, and SHALL delete older entries.
8. IF writing an Audit_Log entry fails, THEN THE API SHALL fail the action that the entry records and SHALL change nothing.
9. FOR ALL lists of entries, THE chain verifier SHALL accept an unmodified chain and SHALL report the first entry whose content or position was changed (round-trip property).

### Requirement 25: Route alerts with rules

**User Story:** As a dispatcher, I want rules that decide who gets which alert on which channel, so that the right person is notified.

#### Acceptance Criteria

1. WHERE `FEATURE_ALERT_ROUTING` is on, THE Notifier SHALL evaluate the Organization's Routing_Rules for each Event before it sends any message.
2. THE Routing_Rule SHALL consist of conditions on airport, Event type, ARTCC or region, followed item and time window, and an action that names recipients and Notification_Channels.
3. WHEN more than one Routing_Rule matches an Event, THE Notifier SHALL apply the rule with the lowest priority number first and SHALL send each recipient at most one message per Notification_Channel per Event.
4. IF no Routing_Rule matches an Event, THEN THE Notifier SHALL use each recipient's own Watchlist and enabled Notification_Channels, as MVP Requirement 9 states.
5. THE API SHALL validate each Routing_Rule with a Zod schema and SHALL reject a rule that names a recipient outside the Organization.
6. THE Frontend SHALL show a preview that lists which recipients and channels a rule would notify for a sample Event.
7. WHILE `FEATURE_ALERT_ROUTING` is off, THE Notifier SHALL use only each recipient's own Watchlist and email, as `main` does.
8. FOR ALL Routing_Rule sets and Events, THE routing function SHALL return a set of deliveries with no duplicate recipient and channel pair (invariant property).
9. FOR ALL Routing_Rule sets and Events, THE routing function SHALL return the same deliveries for any ordering of rules that have different priority numbers (confluence property).

### Requirement 26: Escalate unacknowledged alerts

**User Story:** As a duty manager, I want an alert that nobody acknowledged to go to the next person, so that no ground stop is missed.

#### Acceptance Criteria

1. WHERE `FEATURE_ESCALATION` is on and `FEATURE_ALERT_ROUTING` is on, THE Notifier SHALL start the Escalation_Policy of a Routing_Rule when it sends the first message for an Event.
2. THE Escalation_Policy SHALL consist of ordered steps, and each step SHALL name recipients, Notification_Channels and a wait time of 1 to 120 minutes.
3. WHEN the wait time of a step ends and no recipient has recorded an Acknowledgement, THE Notifier SHALL send the messages of the next step.
4. WHEN a recipient records an Acknowledgement, THE Notifier SHALL stop the Escalation_Policy for that Event.
5. WHEN the Event ends before a step runs, THE Notifier SHALL cancel the remaining steps for that Event and SHALL record the cancellation.
6. THE Notifier SHALL start each escalation step within 60 seconds of its due time.
7. THE Notifier SHALL deduplicate escalation messages per Event, step, recipient and Notification_Channel.
8. IF the latest Snapshot is older than 10 minutes when a step is due, THEN THE Notifier SHALL defer the step until a fresh Snapshot confirms the Event is still active.
9. THE Frontend SHALL show for each open escalation its current step, the time of the next step and the Acknowledgement state as text.
10. FOR ALL Escalation_Policies, Event start times and Acknowledgement times, THE escalation scheduler SHALL return the steps due at a given time such that no step is due before the sum of the wait times of the earlier steps, and no step is due after an Acknowledgement or event end (invariant property).

### Requirement 27: Send daily digests

**User Story:** As a manager, I want a daily digest of what happened, so that I get the overview without reading every alert.

#### Acceptance Criteria

1. WHERE `FEATURE_DIGESTS` is on, THE Poller SHALL send each subscribed recipient one Digest per day at the local time the recipient chose, in the recipient's chosen time zone.
2. THE Digest SHALL list the Events of the previous 24 hours for the recipient's Watchlist and followed items, each with its Explanation unaltered, and SHALL state "No disruptions" when there are none.
3. THE Notifier SHALL send at most one Digest per recipient per local calendar day, including after a cron retry.
4. WHEN a time zone has a daylight-saving change, THE Poller SHALL send the Digest once on that day.
5. THE Digest SHALL include a link that turns off Digests for that recipient and displays a confirmation.
6. THE Notifier SHALL send a Digest only through the channels the recipient enabled for Digests.
7. IF the latest Snapshot is older than 10 minutes at the Digest time, THEN THE Notifier SHALL send the Digest with a stale-data notice and the capture time of the latest Snapshot.
8. FOR ALL time zones and dates, THE digest scheduler SHALL return exactly one send time per local calendar day (invariant property).

### Requirement 28: Host in multiple regions

**User Story:** As an operator, I want AeroBrief to keep serving when one region fails, so that availability holds during a regional outage.

#### Acceptance Criteria

1. WHERE `FEATURE_MULTI_REGION` is on, THE API SHALL serve read requests from the Neon read replica nearest to the request, and SHALL send all writes to the primary.
2. WHILE a read replica lags behind the primary by more than 30 seconds, THE API SHALL read from the primary or SHALL return the stale indicator of MVP Requirement 6.2.
3. IF the primary is unreachable, THEN THE API SHALL keep serving stored data from a replica with the stale indicator and SHALL return a service-unavailable response with a 30-second retry indication for writes.
4. THE Poller SHALL run in exactly one Region at a time, and SHALL use the existing lease so that two Regions never poll at once.
5. WHEN the Poller's Region fails, THE standby Region SHALL take the lease after the lease expires, and SHALL start polling within 10 minutes.
6. THE AeroBrief SHALL meet an availability of 99.95% per calendar month for the API, measured as in MVP Requirement 12.1, once `FEATURE_MULTI_REGION` is on.
7. THE AeroBrief SHALL keep each Organization's data in the Region set for that Organization when the data-protection review requires it.
8. WHILE `FEATURE_MULTI_REGION` is off, THE API SHALL use the single Neon endpoint of `main`.

### Requirement 29: Build Dashboards with drag and drop

**User Story:** As a dispatcher, I want to arrange my own Dashboard, so that I see my airports and reports in the order I need.

#### Acceptance Criteria

1. WHERE `FEATURE_DASHBOARDS` is on, THE Frontend SHALL let a Member create, rename, arrange and delete Dashboards that hold Widgets.
2. THE Frontend SHALL offer these Widgets: airport status, watchlist, recent Events, nationwide status, and, when the matching flags are on, Trend_Report and Prediction.
3. WHEN a Member drags a Widget and drops it in a new position, THE Frontend SHALL save the new order and SHALL show it after a reload.
4. THE Frontend SHALL provide a keyboard alternative for every drag action: a Member can focus a Widget, press a key to pick it up, move it with arrow keys, and press a key to drop or cancel.
5. WHEN a Widget is picked up, moved, dropped or cancelled, THE Frontend SHALL announce the action and the new position in an ARIA live region.
6. THE Frontend SHALL also provide "Move up" and "Move down" buttons for every Widget, so that arrangement needs no drag gesture.
7. THE Frontend SHALL save a Dashboard only through the API, and SHALL limit a Member to 10 Dashboards and 12 Widgets per Dashboard.
8. THE Frontend SHALL implement drag and drop with native browser APIs and no new runtime dependency, unless the project owner approves a dependency as a Stack_Deviation.
9. THE Frontend SHALL show an Organization-shared Dashboard to the Members whom the Role allows to see it.
10. FOR ALL Widget lists and move operations, THE reorder function SHALL return a list that holds the same Widgets, each once, with the moved Widget at the target position (invariant property).
11. FOR ALL Widget lists, moving a Widget to a position and then back to its original position SHALL return the original list (round-trip property).

### Requirement 30: Support white-labeling

**User Story:** As an Organization admin, I want our logo, name and colors on AeroBrief pages and emails, so that our team sees one consistent brand.

#### Acceptance Criteria

1. WHERE `FEATURE_WHITE_LABEL` is on and `FEATURE_ORGS` is on, THE Frontend SHALL apply an Organization's Brand_Settings to the pages that a Member of that Organization views.
2. THE API SHALL accept a logo only as PNG, SVG or WebP, up to 512 KB, and SHALL sanitize SVG so that it holds no script, no external reference and no event handler.
3. THE Frontend SHALL map Brand_Settings colors onto existing design tokens and SHALL NOT use a brand color that fails the contrast rule of Requirement 31 for its pairing.
4. IF a submitted brand color pair fails the contrast ratio of the active Theme, THEN THE API SHALL reject the Brand_Settings with a message that names the failing pair and the ratio.
5. THE Notifier SHALL use the Organization's display name in the body of emails sent to its Members, and SHALL keep the sender domain AeroBrief controls unless the Organization completes sender-domain verification.
6. THE Frontend SHALL keep the data source attribution "FAA NAS Status API" and the license text of MVP Requirement 15.3 on every page of a white-labeled view, unless a Data_Source license allows removing an attribution.
7. THE Frontend SHALL NOT change the DOM structure of the airport table, banners, navigation bar or `aria-live` region for branding, and SHALL restyle with tokens and class names only.
8. WHILE `FEATURE_WHITE_LABEL` is off, THE Frontend SHALL show the AeroBrief brand on every page.
9. FOR ALL foreground and background color pairs in Brand_Settings, THE brand validator SHALL accept the pair only if its contrast ratio meets the threshold of the active Theme (invariant property).

### Requirement 31: Offer a dark mode

**User Story:** As a user who works at night, I want a dark theme, so that the page is comfortable to read in low light.

#### Acceptance Criteria

1. WHERE `FEATURE_DARK_MODE` is on, THE Frontend SHALL offer the dark Theme through a visible control with a text label, and SHALL default to the setting of the visitor's operating system until the visitor chooses a Theme.
2. THE Frontend SHALL store the visitor's chosen Theme in the browser and, for a signed-in User, in the User's settings.
3. THE Frontend SHALL define the dark Theme as a second set of values for the existing design tokens in `apps/web/src/styles/tokens.css`, and SHALL list every dark color token and every dark color pair in `palette.ts` and `palettePairs`.
4. THE Frontend SHALL give every dark Theme text pair a contrast ratio of at least 4.5:1, and every large text pair, component boundary and focus indicator at least 3:1.
5. THE Frontend SHALL keep the DOM structure of the airport table, banners, navigation bar and `aria-live` region unchanged for the dark Theme.
6. THE Frontend SHALL show status, banners and states through text in the dark Theme, with color as decoration only.
7. THE Frontend SHALL use no new runtime dependency and no icon package for the dark Theme, and SHALL keep inline SVG and CSS `mask-image` icons.
8. WHILE `FEATURE_DARK_MODE` is off, THE Frontend SHALL render the default Theme and the default `tokens.css` values with no Theme control.
9. FOR ALL color pairs in `palettePairs` of the dark Theme, THE contrast function SHALL return a ratio at or above the pair's required threshold (invariant property).

### Requirement 32: Meet WCAG 2.1 AAA as an opt-in theme

**User Story:** As a user with low vision, I want a higher-contrast theme that meets AAA, so that text is easier to read.

#### Acceptance Criteria

1. WHERE `FEATURE_AAA` is on, THE Frontend SHALL offer the AAA_Theme as an opt-in choice with a visible text label.
2. THE AAA_Theme SHALL give every normal text pair a contrast ratio of at least 7:1, and every large text pair at least 4.5:1.
3. THE AAA_Theme SHALL give every component boundary and focus indicator a contrast ratio of at least 3:1.
4. THE Frontend SHALL provide the AAA_Theme in a light and a dark variant when `FEATURE_DARK_MODE` is on, and every pair of both variants SHALL appear in `palettePairs`.
5. THE Frontend SHALL give each AAA success criterion that is not a color-contrast criterion an assessment in the design, with one of the results "met", "met by Theme" or "not applicable", and SHALL name the user-facing content that does not meet it.
6. WHEN a pull request is opened or updated and `FEATURE_AAA` is on in the test run, THE CI pipeline SHALL run the accessibility suite against the AAA_Theme and SHALL fail the build on a contrast violation.
7. THE Frontend SHALL keep the default Theme at WCAG 2.1 AA with unchanged tokens WHILE `FEATURE_AAA` is off, as MVP Requirement 13 states.
8. THE Frontend SHALL NOT change the DOM structure of the airport table, banners, navigation bar or `aria-live` region for the AAA_Theme.
9. FOR ALL color pairs in the AAA_Theme, THE contrast function SHALL return a ratio at or above 7:1 for normal text pairs and 4.5:1 for large text pairs (invariant property).

### Requirement 33: Protect Organization and audit data

**User Story:** As an Organization admin, I want my Organization's data protected and deletable, so that I can meet my own data-protection duties.

#### Acceptance Criteria

1. THE AeroBrief SHALL encrypt stored third-party credentials, including Slack tokens, PagerDuty keys, SMS Provider identifiers, Webhook secrets and SSO secrets, and SHALL keep the encryption key in a Worker secret.
2. THE AeroBrief SHALL store API_Keys, SCIM tokens and Magic_Link tokens only as hashes.
3. WHEN an Organization admin requests an export of the Organization's data, THE API SHALL return a machine-readable export of the Organization's settings, Members, Routing_Rules, Dashboards and Audit_Log within the Permissions of that admin.
4. WHEN a Member requests deletion of the Member's personal account, THE API SHALL delete the Member's personal data and SHALL replace the Member's identity in retained Audit_Log entries with a pseudonymous identifier if the data-protection review requires retention.
5. THE AeroBrief SHALL log no secret, token, key, assertion, phone number or full email address in operational logs.
6. THE API SHALL scope every database query for Organization data by Organization identifier, and the Database SHALL enforce that scope by constraint or policy where the stack supports it.
7. IF an Organization's data is requested for a Region other than the Organization's own Region while `FEATURE_MULTI_REGION` is on, THEN THE API SHALL serve it only through the Organization's Region.

### Requirement 34: Hold implementation behind sign-off gates

**User Story:** As a project owner, I want each risky feature to wait for its sign-off, so that I approve cost, legal and stack decisions before code depends on them.

#### Acceptance Criteria

1. THE Phase 2 plan SHALL place each Gate task before the first implementation task of every feature that depends on it.
2. THE Phase 2 plan SHALL list, for each Feature_Area, the Gates and Stack_Deviation approvals it needs.
3. WHILE a Gate or approval is open, THE plan SHALL show the dependent tasks as blocked and SHALL allow work only on parts of the feature that need no blocked technology, Provider or key.
4. WHEN the project owner records a Gate decision, THE plan SHALL record the date, the decision and the owner's name in the spec.
5. THE design SHALL record the open questions that need the project owner's decision, and SHALL NOT assume an answer for any of them.
