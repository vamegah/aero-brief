# AeroBrief public API

AeroBrief serves four read-only JSON endpoints. They need no sign-up and no key. The Phase 2 routes (features, digest, webhooks) are described [at the end](#phase-2-routes-built-off-by-default). They are off by default.

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

## Phase 2 routes (built, off by default)

These routes belong to the four Phase 2 features, which are merged but **off by default**. They are built, not live: production has not had the Phase 2 migrations applied and no flag is on there. They are used by the web app and are not part of the public read-only API above.

A Phase 2 route exists only while its flag is on. While it is off, the path answers exactly like an unknown path (404 `not_found`, for every method). It never answers 405.

| Method | Path | Auth | Needs flag |
| --- | --- | --- | --- |
| GET | `/api/features` | none | any one of the four |
| GET | `/api/digest` | session | `FEATURE_DIGESTS` |
| PUT | `/api/digest` | session | `FEATURE_DIGESTS` |
| POST | `/api/digest/unsubscribe` | signed link | `FEATURE_DIGESTS` |
| GET | `/api/webhooks` | session | `FEATURE_WEBHOOKS` |
| POST | `/api/webhooks` | session | `FEATURE_WEBHOOKS` |
| DELETE | `/api/webhooks/:id` | session | `FEATURE_WEBHOOKS` |
| POST | `/api/webhooks/:id/reenable` | session | `FEATURE_WEBHOOKS` |
| POST | `/api/webhooks/:id/test` | session | `FEATURE_WEBHOOKS` |

A flag is on only when its Worker variable is exactly `true`. "Session" means the `aerobrief_session` cookie set at sign-in. Without a valid one the route returns 401 `unauthorized`. `POST`, `PUT` and `DELETE` also need an `Origin` header equal to the web app's origin (otherwise 403 `forbidden_origin`), and a `POST` or `PUT` body needs `Content-Type: application/json` (otherwise 415 `unsupported_media_type`; invalid JSON is 400 `invalid_json`). Responses use the same error envelope as above.

### GET /api/features

No cookie and no database. Returns which Phase 2 features are on.

```bash
curl https://www.aerobriefs.com/api/features
```

200, with `Cache-Control: no-store`:

```json
{ "darkMode": false, "highContrast": false, "digests": true, "webhooks": false }
```

| Field | Type | Meaning |
| --- | --- | --- |
| `darkMode` | boolean | `FEATURE_DARK_MODE` |
| `highContrast` | boolean | `FEATURE_HIGH_CONTRAST` |
| `digests` | boolean | `FEATURE_DIGESTS` |
| `webhooks` | boolean | `FEATURE_WEBHOOKS` |

While **all four flags are off**, this route answers **404** with `{ "error": { "code": "not_found", "message": "Not found." } }`, the same as any unknown path. The web app treats a 404 as "every feature off".

### GET /api/digest

Returns the signed-in user's daily digest setting. A user who never saved one gets the default.

```json
{ "enabled": false, "hour": 7 }
```

| Field | Type | Meaning |
| --- | --- | --- |
| `enabled` | boolean | Whether the daily digest email is sent. |
| `hour` | integer 0 to 23 | Hour of the day to send it. The poller applies the time zone. |

### PUT /api/digest

Saves the setting. The body must be exactly these two fields. Extra fields are rejected.

```json
{ "enabled": true, "hour": 8 }
```

200 returns the saved `{ "enabled": true, "hour": 8 }`. A body that does not match returns 400 `invalid_request`.

### POST /api/digest/unsubscribe

Used by the link in a digest email. No session: the signed link is the credential. Body, exactly these fields:

```json
{ "userId": "<uuid>", "sig": "<signature from the link>" }
```

200 returns `{ "enabled": false }`. It is safe to repeat, and also returns 200 when the user has no digest row. A bad body returns 400 `invalid_request`. A signature that does not verify returns 403 `invalid_signature`.

### GET /api/webhooks

Lists the signed-in user's webhooks. The URL is never returned, only its host.

```json
{
  "webhooks": [
    {
      "id": "6f1b2c1e-8a3d-4c53-9d0e-2f4a7b9c1d10",
      "host": "hooks.example.com",
      "createdAt": "2026-11-19T14:00:00.000Z",
      "state": "active",
      "lastOutcome": "delivered",
      "lastOutcomeAt": "2026-11-19T14:32:00.000Z",
      "disabledAt": null
    }
  ]
}
```

`state` is `active` or `disabled`. `lastOutcome` is `delivered`, `failed`, `skipped` or `null`. `lastOutcomeAt` and `disabledAt` are `null` when not set.

### POST /api/webhooks

Registers a webhook. Body: `{ "url": "https://hooks.example.com/aerobrief" }`. The URL must pass the rules in [`docs/webhooks.md`](webhooks.md#registering-a-url).

201 returns the item above plus `secret`, the `whsec_...` string used to verify signatures. **The secret is shown this one time.** AeroBrief cannot show it again. If it is lost, delete the webhook and create a new one.

| Status | `code` | When |
| --- | --- | --- |
| 400 | `invalid_request` | The body is not `{ url }` with a string `url`. |
| 400 | `invalid_webhook_url` | The URL breaks a rule. The message names the rule, not the URL. |
| 400 | `webhook_limit` | The user already has 3 webhooks. |

### DELETE /api/webhooks/:id

200 returns `{ "deleted": true }`. An unknown id, or one that belongs to another user, returns 404 `not_found`.

### POST /api/webhooks/:id/reenable

Turns a disabled webhook back on and clears its failure count. Safe to repeat. The body is ignored, but the request still needs `Content-Type: application/json` (send `{}`). 200 returns the webhook item. 404 `not_found` for an unknown id.

### POST /api/webhooks/:id/test

Sends one signed `TEST` event to the webhook, one attempt, no retries. Same body rule as re-enable. Allowed once per 60 seconds per webhook.

200:

```json
{ "outcome": "delivered", "status": 204 }
```

`outcome` is `delivered` or `failed`. `status` is the HTTP status your endpoint returned. It is replaced by `errorKind` (`timeout`, `network`, `blocked_url`, `invalid_payload` or `not_allowlisted`) when there was no response. Within the 60 seconds the API answers 429 with `Retry-After`:

```json
{ "error": { "code": "rate_limited", "message": "Send one test event per webhook per minute. Try again shortly." }, "retryAfterSeconds": 42 }
```

### Webhook routes without a master secret

Every `/api/webhooks` route returns 503 `webhooks_not_configured` when the Worker has no `WEBHOOK_MASTER_SECRET` of at least 32 characters. This 503 has no `Retry-After`, because retrying does not fix it.

## Verifying a webhook you receive

AeroBrief sends each event as a signed `POST` to your URL. Check the signature before you trust the body. The full receiver guide (payloads, retries, replay storage, auto-disable) is in [`docs/webhooks.md`](webhooks.md).

Each request carries three headers:

| Header | Value |
| --- | --- |
| `X-AeroBrief-Delivery` | UUID of the delivery. Same value on every retry. |
| `X-AeroBrief-Timestamp` | Unix time in whole seconds when this attempt was signed. |
| `X-AeroBrief-Signature` | `v1=` plus 64 lowercase hex characters. |

The signature is the HMAC-SHA256 of the text `<timestamp>.<raw body>`. The key is the whole `whsec_...` secret as UTF-8 text (keep the `whsec_` prefix, no base64 decoding). Read the body as raw text, and do not parse and re-serialize it first. Reject a timestamp more than 300 seconds from your clock (exactly 300 is accepted).

```ts
const encoder = new TextEncoder();

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** True only when the header is well formed, the timestamp is fresh and the signature matches. */
export async function verifyAeroBriefWebhook(
  secret: string, // the full "whsec_..." string
  rawBody: string, // the unmodified request text
  headers: Headers,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const signature = headers.get("X-AeroBrief-Signature") ?? "";
  const timestamp = Number(headers.get("X-AeroBrief-Timestamp"));
  if (!/^v1=[0-9a-f]{64}$/.test(signature)) return false;
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  // crypto.subtle.verify compares in constant time. Do not compare the hex strings with ===.
  return crypto.subtle.verify("HMAC", key, fromHex(signature.slice(3)), encoder.encode(`${timestamp}.${rawBody}`));
}
```

Use it on the raw text: `const ok = await verifyAeroBriefWebhook(secret, await request.text(), request.headers);`. A timestamp check does not stop a captured request from being replayed inside the 300-second window, so also store each `X-AeroBrief-Delivery` value for at least 10 minutes and drop repeats. See [`docs/webhooks.md`](webhooks.md#replay-storage).
