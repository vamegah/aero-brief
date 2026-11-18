# AeroBrief public API

AeroBrief serves four read-only JSON endpoints. They need no sign-up and no key.

## Terms

- No API keys. No accounts are needed to call these endpoints.
- No rate tiers. There is one tier for everyone. Please follow the refresh guidance below.
- No SLA beyond the 99.9% availability target.
- The API is unversioned. Endpoints and fields may change.
- Data covers 20 monitored U.S. airports and the last 24 hours only.

## Base URLs

| Base URL | Notes |
| --- | --- |
| `https://www.aerobriefs.com/api` | Production site. Vercel rewrites `/api/*` to the Worker. |
| `https://aerobrief-api.vamegah.workers.dev/api` | Cloudflare Worker directly. |

Every path below starts with `/api`.

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/health` | Liveness check |
| GET | `/api/status/national` | All 20 airports, nationwide summary, recent events |
| GET | `/api/status/airport/:code` | One airport and its recent events |
| GET | `/api/history/:code` | Events for one airport, optional `since` filter |

`:code` is a three-letter airport code, case-insensitive (`jfk` and `JFK` are the same). The monitored codes are: ATL, BOS, DCA, DEN, DFW, DTW, EWR, IAH, JFK, LAS, LAX, MCO, MEM, MIA, MSP, ORD, PHX, SEA, SFO, SLC. Any other code returns 404 `airport_not_found`.

All responses are `application/json; charset=utf-8`.

### GET /api/health

```bash
curl https://www.aerobriefs.com/api/health
```

```json
{ "status": "ok" }
```

It does not touch the database.

### GET /api/status/national

```bash
curl https://www.aerobriefs.com/api/status/national
```

```js
const res = await fetch("https://www.aerobriefs.com/api/status/national");
const data = await res.json();
if (data.state === "ok" && data.stale) console.warn("Data is older than 10 minutes");
```

Response when data exists (trimmed to 2 of the 20 airports; the live response lists all 20 in a fixed order):

```json
{
  "state": "ok",
  "capturedAt": "2026-11-18T19:25:29.556Z",
  "stale": false,
  "airports": [
    { "airportId": "ATL", "name": "Hartsfield-Jackson Atlanta International", "groundStop": null },
    {
      "airportId": "JFK",
      "name": "John F. Kennedy International",
      "groundStop": {
        "reasonText": "Plain-language reason for the ground stop",
        "expectedEnd": "2026-11-18T20:30:00.000Z",
        "advisoryUrl": "https://www.fly.faa.gov/..."
      }
    }
  ],
  "nationwide": { "active": false, "count": 0, "artccs": [], "explanation": null },
  "events": []
}
```

The `groundStop` object and the `events` item shown here are illustrative. A live response with no active disruption has `groundStop: null` and an empty `events` array.

Response before the first poll has stored anything:

```json
{ "state": "no_data", "message": "No airport status data is available yet. Check back in a few minutes." }
```

| Field | Type | Nullable | Meaning |
| --- | --- | --- | --- |
| `state` | `"ok"` or `"no_data"` | no | Which shape follows. Check this first. |
| `message` | string | no | Only with `no_data`. |
| `capturedAt` | string (ISO 8601 UTC) | no | When the FAA data was captured. |
| `stale` | boolean | no | `true` when `capturedAt` is more than 10 minutes old. |
| `airports` | array of Airport | no | Always 20 items. |
| `nationwide.active` | boolean | no | A nationwide event is in progress. |
| `nationwide.count` | number | no | Number of ground stops counted for the nationwide event. |
| `nationwide.artccs` | string[] | no | Affected FAA control centers. May be empty. |
| `nationwide.explanation` | string | yes | Plain-language text. `null` when `active` is `false`. |
| `events` | array of Event | no | Last 24 hours, newest first. May be empty. |

**Airport**

| Field | Type | Nullable | Meaning |
| --- | --- | --- | --- |
| `airportId` | string | no | Three-letter code. |
| `name` | string | no | Airport name. |
| `groundStop` | object | yes | `null` when no ground stop is active. |
| `groundStop.reasonText` | string | no | Plain-language reason. Raw FAA codes are never returned. |
| `groundStop.expectedEnd` | string | yes | Expected end time, when known. |
| `groundStop.advisoryUrl` | string | yes | FAA advisory link. Only links that pass validation are returned. |

**Event**

| Field | Type | Nullable | Meaning |
| --- | --- | --- | --- |
| `type` | string | no | `GROUND_STOP_STARTED`, `GROUND_STOP_ENDED` or `NATIONWIDE_EVENT`. |
| `airportId` | string | yes | `null` for nationwide events. |
| `occurredAt` | string (ISO 8601 UTC) | no | When the change was detected. |
| `explanation` | string | no | Plain-language text. |

### GET /api/status/airport/:code

```bash
curl https://www.aerobriefs.com/api/status/airport/JFK
```

```js
const res = await fetch("https://www.aerobriefs.com/api/status/airport/JFK");
const data = await res.json();
```

```json
{
  "state": "ok",
  "capturedAt": "2026-11-18T19:25:29.556Z",
  "stale": false,
  "airport": { "airportId": "JFK", "name": "John F. Kennedy International", "groundStop": null },
  "events": []
}
```

`airport` uses the Airport shape above and `events` holds only that airport's events from the last 24 hours. With no stored data the response is the same `no_data` object as the national endpoint. An unmonitored code returns:

```json
{ "error": { "code": "airport_not_found", "message": "That airport is not monitored by AeroBrief." } }
```

### GET /api/history/:code

```bash
curl "https://www.aerobriefs.com/api/history/JFK?since=2026-11-18T12:00:00Z"
```

```js
const res = await fetch("https://www.aerobriefs.com/api/history/JFK");
const { airportId, events } = await res.json();
```

```json
{ "airportId": "JFK", "events": [] }
```

| Field | Type | Nullable | Meaning |
| --- | --- | --- | --- |
| `airportId` | string | no | Upper-case code. |
| `events` | array of Event | no | Newest first. May be empty. |

Query parameter:

| Name | Type | Required | Behavior |
| --- | --- | --- | --- |
| `since` | ISO 8601 date-time | no | Return events at or after this time. |

The window is 24 hours. Without `since`, you get the last 24 hours. A `since` earlier than 24 hours ago is raised to 24 hours ago (clamped), so older data is never returned. A `since` that cannot be parsed returns 400 `invalid_since`.

## The 24-hour window

AeroBrief keeps and serves 24 hours of history. `events` in all endpoints and the history endpoint never include anything older.

## The stale indicator

`stale` is `true` when the latest snapshot's `capturedAt` is more than 10 minutes (600 seconds) old, for example when the FAA feed is down. The API keeps returning the last stored data in that case, with `capturedAt` showing its age. Show `capturedAt` to your users and treat `stale: true` as "may be out of date". Exactly 10 minutes old is not stale.

## Errors

Errors use one envelope:

```json
{ "error": { "code": "not_found", "message": "Not found." } }
```

| Status | `code` | When |
| --- | --- | --- |
| 400 | `invalid_since` | `since` is not an ISO 8601 date-time. |
| 404 | `airport_not_found` | `:code` is not one of the 20 monitored airports. |
| 404 | `not_found` | Unknown path. |
| 405 | `method_not_allowed` | Wrong method on a known path. An `Allow` header lists the valid methods. |
| 503 | `service_unavailable` | The database failed or the request took longer than 5 seconds. |

### 503 and Retry-After

A 503 always carries `Retry-After: 30`. Wait at least 30 seconds, then retry.

```json
{ "error": { "code": "service_unavailable", "message": "The service is temporarily unavailable. Try again shortly." } }
```

```js
const res = await fetch("https://www.aerobriefs.com/api/status/national");
if (res.status === 503) {
  const wait = Number(res.headers.get("Retry-After") ?? "30");
  setTimeout(retry, wait * 1000);
}
```

`GET` requests do not need an `Origin` header. The Origin check applies only to mutating requests (`POST`, `DELETE`), which are not part of this API.

## Caching and refresh guidance

- The poller refreshes data every 5 minutes.
- Poll no more often than once a minute. More often returns the same data.
- Keep your last good response and show it with its `capturedAt` if a later request fails.

## CORS

The API code sets no CORS headers. Call it from a server, a script or the same origin. Browser calls from other origins are not supported.

## Not a public API

These endpoints exist for the AeroBrief web app. They need a signed-in session or a signed link, and they are not supported for outside use: authentication (`/api/auth/*`), watchlist (`/api/watchlist`), account (`/api/account`) and unsubscribe (`/api/unsubscribe`).
