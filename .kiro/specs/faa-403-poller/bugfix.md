# Bugfix Requirements Document

## Introduction

The production poller Worker `aerobrief-poller` (cron `*/5 * * * *`) gets HTTP 403 from `https://nasstatus.faa.gov/api/airport-events` on every poll. Observed 2026-11-21 about 02:00 UTC: `job_runs` on the production Neon database holds 289 rows, all `outcome=failed`, `failure_kind=http_status`, `detail='HTTP 403'`, from 2026-11-20 02:00 to 2026-11-21 02:00 UTC. `job_runs` keeps only 24 hours, so the failures may have started earlier. `snapshots` is empty, so `/api/status/national` returns `{"state":"no_data"}`, no alert email can fire, and the live site https://www.aerobriefs.com shows no data.

Known facts:

- The task 13.3 smoke test (around 2026-11-17) verified cron and snapshots in production. The failure started after that.
- It is not caused by Phase 2. It happens on the version deployed 2026-11-18 and on commit `73cf45e` (deployed 2026-11-21 01:56 UTC).
- From the owner's Windows machine the same URL returns 200 with valid JSON, with no `User-Agent`, with curl's `User-Agent`, and with `AeroBrief/1.0 (+https://www.aerobriefs.com)`.
- The Worker tail shows outcome `ok`, no exceptions and no log lines. The 403 is visible only in `job_runs`.

**Diagnostic result (2026-11-21, `probe-result.md`).** A throwaway Worker called the FAA URL three ways from Cloudflare (colo DFW): no headers, the AeroBrief `User-Agent`, and a browser-like `User-Agent`. All three got HTTP 403 with an "Access Denied" page in the Akamai error format. Request headers do not fix it. The FAA edge denies traffic from Cloudflare Workers.

**Owner decision (2026-11-22).** The owner chose a relay on a Vercel Function (option 2) and explicitly approved this deviation from `tech.md` (which names Cloudflare Workers as the backend). The relay lives in the existing Vercel project and calls the FAA from Vercel's network. The poller calls the relay instead of the FAA. Whether Vercel's network is also denied is not yet known. The first task proves it on a Preview deployment, before the poller is changed. If Vercel is denied too, work stops and the owner is told.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the poller Worker runs in production on the Cloudflare Workers runtime and calls the FAA URL via `fetchFaa` THEN the system receives HTTP 403, records a failed `job_run` (`http_status`, `HTTP 403`) and stores no Snapshot.

1.2 WHEN no Snapshot has ever been stored THEN the system answers `/api/status/national` with `state: "no_data"`, shows no data on the site, and sends no alert emails.

1.3 WHEN the FAA answers a poll with a non-2xx status, again and again, THEN the system writes nothing to the Worker logs, so the persistent upstream failure is invisible in Worker logs and the tail.

1.4 WHEN the poller adds or changes request headers (`User-Agent`, `Accept`) on the request to the FAA THEN the system still receives HTTP 403, so the poller cannot fix the denial by itself.

### Expected Behavior (Correct)

2.1 WHEN the poller Worker polls in production and both `FAA_RELAY_URL` and `FAA_RELAY_SECRET` are set and valid THEN the system SHALL send the request to the relay URL with the shared-secret header `X-AeroBrief-Relay-Key`, keep the 10 s timeout, validate the body with the same `parseFaaBody`, store a Snapshot and record a success `job_run` when the relay returns 200 with a valid body.

2.2 WHEN the relay receives a request THEN the system SHALL answer only `GET`, SHALL require the shared secret in the `X-AeroBrief-Relay-Key` header compared in constant time, SHALL fetch only the fixed URL `https://nasstatus.faa.gov/api/airport-events` with no URL, query, path or header taken from the caller, SHALL time out the FAA call after 10 s, SHALL cap the body it returns, SHALL pass through the FAA status, and SHALL add `Cache-Control: no-store`. The relay SHALL answer 405 for any other method, and 401 for a missing or wrong key without calling the FAA. The relay SHALL NOT log or return the secret.

2.3 WHEN the FAA answers a poll with a non-2xx status THEN the system SHALL write a structured warning to the Worker logs (status code, failure kind, no secrets, no request headers) on the first failure after a non-failed poll, and after that at most once per hour while the failure continues.

2.4 WHEN `FAA_RELAY_URL` and `FAA_RELAY_SECRET` are both unset THEN the system SHALL call the FAA URL directly, exactly as before this fix, so that unsetting both is the rollback switch.

2.5 WHEN exactly one of the two relay settings is set, or `FAA_RELAY_URL` is not an `https` URL on the host `www.aerobriefs.com`, or `FAA_RELAY_SECRET` has fewer than 32 characters THEN the system SHALL fail closed: make no outbound request, record a failed `job_run` with `failure_kind=validation` and a `detail` that names only the invalid setting keys, and write one error log that names only those keys.

2.6 WHEN the relay secret is in use THEN the system SHALL NOT write it, or any part of it, to `job_runs`, to logs, to the relay response, or to any error message, on the poller side or the relay side.

2.7 WHEN the relay probe on a Vercel Preview deployment shows that Vercel's network also gets a non-2xx answer from the FAA THEN the system SHALL NOT be changed further. Work SHALL stop and the result SHALL be reported to the owner.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the poller makes any outbound request THEN the system SHALL CONTINUE TO call only the FAA host `nasstatus.faa.gov` at the single URL `https://nasstatus.faa.gov/api/airport-events`, or the one configured relay URL, and nothing else. The relay SHALL CONTINUE TO call only the FAA URL (Requirement 1.2 of the MVP spec, updated by the owner's decision of 2026-11-22).

3.2 WHEN `fetchFaa` meets a timeout, network error, non-2xx status, unparseable body or validation failure THEN the system SHALL CONTINUE TO return a typed failure result and never throw, and `runPoll` SHALL CONTINUE TO record a failed `job_run` with the same `failure_kind` and `detail` values and release the lease.

3.3 WHEN the FAA answers 200 with a valid body (directly or through the relay) THEN the system SHALL CONTINUE TO parse it, store one Snapshot with its Events and a success `job_run` in one transaction, and run the notifier and webhooks as before.

3.4 WHEN the poller or the API runs THEN the system SHALL CONTINUE TO use no scraping, no FAA SWIM, no other data source and no always-on server, and no technology outside `tech.md` without explicit owner approval. The one approved exception is the Vercel Function relay of this spec.

3.5 WHEN the cleanup job runs THEN the system SHALL CONTINUE TO keep only 24 hours of history, including `job_runs`.

3.6 WHEN every `FEATURE_*` flag is off THEN the system SHALL CONTINUE TO behave exactly like the MVP, with the same routes, the same responses and no extra queries. This fix adds no `FEATURE_*` flag. The environment variables of requirement 2.4 are the switch.

3.7 WHEN production Workers are deployed THEN the system SHALL CONTINUE TO deploy only from `main` via `.github/workflows/deploy-workers.yml`, and the diagnostic Worker SHALL NOT be part of that workflow.

3.8 WHEN a browser requests any existing frontend route (`/`, `/sign-in`, `/watchlist`, `/unsubscribe`, `/auth/callback`, any other path) or any existing `/api/*` route THEN the system SHALL CONTINUE TO answer exactly as before: `/api/*` goes to the API Worker, other paths serve `index.html`. The DOM of the web app is unchanged.
