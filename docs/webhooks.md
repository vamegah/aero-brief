# AeroBrief webhooks: receiver guide

> Phase 2 feature, behind the `webhooks` flag (off by default). This guide is for the people who run the receiving endpoint.

AeroBrief sends one signed HTTPS `POST` to your URL when a ground stop starts, a ground stop ends, or a nationwide ground stop is detected. You verify the signature, answer with a `2xx`, and do your work afterwards.

## Quick checklist

1. Read the **raw request body** as text. Do not parse and re-serialize it before checking the signature.
2. Build the signed text `<timestamp>.<raw body>` from the `X-AeroBrief-Timestamp` header and the raw body.
3. Compute HMAC-SHA256 with the full `whsec_...` string as the key, as UTF-8 bytes. The prefix `whsec_` is part of the key.
4. Compare with `X-AeroBrief-Signature` in constant time.
5. Reject a timestamp more than 300 seconds from your own clock.
6. Store each `X-AeroBrief-Delivery` value for at least 10 minutes and drop repeats.
7. Answer `2xx` quickly.

## Request

Method `POST`, to the URL you registered. Four headers:

| Header | Value |
| --- | --- |
| `Content-Type` | `application/json` |
| `X-AeroBrief-Delivery` | The Delivery_ID: the same UUID as `id` in the body. Every retry of one delivery carries the same value. |
| `X-AeroBrief-Timestamp` | Unix time in whole seconds when this attempt was signed. Each attempt, including a retry, takes a fresh timestamp and signature. |
| `X-AeroBrief-Signature` | `v1=` followed by 64 lowercase hex characters. |

The body is at most 4096 bytes of JSON.

## Signing

```
signed text = <timestamp> + "." + <raw body>
signature   = "v1=" + lowercase hex( HMAC-SHA256( key, signed text ) )
```

- `<timestamp>` is the decimal text of `X-AeroBrief-Timestamp`.
- `<raw body>` is the exact bytes AeroBrief sent, decoded as UTF-8.
- `key` is the full secret string, for example `whsec_AbC...`, as UTF-8 bytes. Do not strip `whsec_` and do not base64-decode the rest.

The secret is shown once, when you create the webhook. AeroBrief does not store it and cannot show it again. If you lose it, delete the webhook and create a new one.

### Replay window

Reject a request when `|your clock in seconds - timestamp|` is more than **300**. Exactly 300 seconds apart is accepted. Keep your server clock in sync (NTP).

### Constant-time comparison

Do not compare signatures with `===` or `==`. Use a constant-time check. With Web Crypto, `crypto.subtle.verify("HMAC", ...)` does the comparison for you, and the example below uses it. Accept only a header that matches `^v1=[0-9a-f]{64}$`.

### Replay storage

The timestamp check stops old requests. It does not stop a captured request from being replayed inside the 300-second window. Store every `X-AeroBrief-Delivery` value you have accepted for **at least 10 minutes** (the window is 300 seconds on each side of your clock, so 10 minutes covers it) and drop a request whose Delivery_ID is already stored.

A retry of a delivery you answered with a non-2xx status reuses its Delivery_ID. So record the Delivery_ID only after you have accepted the event, and answer a repeat with `2xx` without processing it again. A short-lived store is enough: a Cloudflare KV key with a TTL of 600 seconds or more, a Redis key with `SET ... NX EX 600`, or a table with a purge job.

## Payload

The body is a JSON object. Extra fields are not added. `type` tells you the shape.

Common fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string (UUID) | The Delivery_ID. |
| `type` | string | `ground_stop.started`, `ground_stop.ended`, `nationwide.event` or `TEST`. |
| `createdAt` | string | ISO 8601 UTC instant of the event (for `TEST`, when the test was sent). |
| `data` | object | Depends on `type`. See below. |
| `text` | string, 1 to 1500 characters | One-line summary. See [Slack](#the-text-field-and-slack). |

### `ground_stop.started`, `ground_stop.ended`, `nationwide.event`

`data` fields:

| Field | Type | Limit | Notes |
| --- | --- | --- | --- |
| `eventKey` | string | 1 to 100 characters | Stable key of the event: the FAA event ID for a ground stop, `NATIONWIDE:<eventTime>` for a nationwide event. |
| `airportId` | string or `null` | 1 to 8 characters | Airport code. `null` for `nationwide.event`. |
| `airportName` | string or `null` | 1 to 80 characters | `null` for `nationwide.event`. |
| `eventTime` | string | ISO 8601 UTC | When the event happened. |
| `explanation` | string | 1 to 400 characters | Plain-language reason. Control characters are removed. |

`ground_stop.started`:

```json
{
  "id": "6f1b2c1e-8a3d-4c53-9d0e-2f4a7b9c1d10",
  "type": "ground_stop.started",
  "createdAt": "2026-11-19T14:32:00.000Z",
  "data": {
    "eventKey": "EWR-GS-20261119-1432",
    "airportId": "EWR",
    "airportName": "Newark Liberty International",
    "eventTime": "2026-11-19T14:32:00.000Z",
    "explanation": "Flights to Newark are held at their departure airports because of storms at the airport."
  },
  "text": "Ground stop started at Newark Liberty International (EWR): Flights to Newark are held at their departure airports because of storms at the airport. (14:32 UTC)"
}
```

`ground_stop.ended`:

```json
{
  "id": "0d7e5a42-3b6f-4f0e-8c1a-9a5b2e7d4c33",
  "type": "ground_stop.ended",
  "createdAt": "2026-11-19T15:47:00.000Z",
  "data": {
    "eventKey": "EWR-GS-20261119-1432",
    "airportId": "EWR",
    "airportName": "Newark Liberty International",
    "eventTime": "2026-11-19T15:47:00.000Z",
    "explanation": "The ground stop at Newark has ended. Flights are departing again."
  },
  "text": "Ground stop ended at Newark Liberty International (EWR): The ground stop at Newark has ended. Flights are departing again. (15:47 UTC)"
}
```

`nationwide.event`:

```json
{
  "id": "b2c4e6a8-1d3f-4a5b-8c7d-0e9f1a2b3c4d",
  "type": "nationwide.event",
  "createdAt": "2026-11-19T16:05:00.000Z",
  "data": {
    "eventKey": "NATIONWIDE:2026-11-19T16:05:00.000Z",
    "airportId": null,
    "airportName": null,
    "eventTime": "2026-11-19T16:05:00.000Z",
    "explanation": "The FAA has stopped flights across the United States."
  },
  "text": "Nationwide ground stop: The FAA has stopped flights across the United States. (16:05 UTC)"
}
```

The sample explanations are illustrative. The wording of `explanation` is generated and can change.

### `TEST`

Sent only when you press "Send test event". `data` has exactly two fields: `test` (always `true`) and `note` (1 to 200 characters).

```json
{
  "id": "c9d8e7f6-5a4b-4c3d-9e2f-1a0b9c8d7e6f",
  "type": "TEST",
  "createdAt": "2026-11-19T14:00:00.000Z",
  "data": {
    "test": true,
    "note": "This is a test event from AeroBrief. No real disruption occurred."
  },
  "text": "TEST: This is a test event from AeroBrief. No real disruption occurred. (14:00 UTC)"
}
```

## The `text` field and Slack

`text` is a single line (no line breaks or control characters). It has the form `<headline>: <explanation> (<HH:MM> UTC)`, where the explanation inside `text` is cut to 200 characters with an ellipsis. The characters `&`, `<` and `>` are written as `&amp;`, `&lt;` and `&gt;` in `text` only, which is the escaping Slack asks for. `data.explanation` is not escaped.

Slack incoming webhooks display the top-level `text` field and are expected to ignore the other JSON fields, so you can point a Slack incoming-webhook URL at AeroBrief. Note that a Slack URL cannot verify the signature, and Slack does not ask for it. This behavior comes from Slack's documentation. It has not been checked against a real Slack workspace: the project owner dropped that manual check (task 4.37) on 2026-11-19. Use "Send test event" to confirm delivery to your own Slack URL.

## Response: what to send back

Answer with a `2xx` status as soon as the signature and replay checks pass. Do slow work after you respond. AeroBrief waits at most **5 seconds** for a response, then counts the attempt as a timeout.

AeroBrief ignores your response body and headers. It never reads the body, so there is nothing to put in it.

## Retries

A delivery makes up to **3 attempts**: the first attempt, a second one 2 seconds after the first attempt ends, and a third one 8 seconds after the second attempt ends. Each attempt has a 5-second timeout.

| Attempt result | What happens |
| --- | --- |
| `2xx` | Delivered. No more attempts. |
| Network error or timeout | Retried. |
| `408`, `429` or any `5xx` | Retried. |
| Any other status: other `4xx`, `1xx`, and every `3xx` | Not retried. The delivery fails. |
| Stored URL no longer passes the URL rules | Not retried. The delivery fails without a request. |

Redirects are **not followed**. A `301`, `302`, `307` or `308` counts as a failure, so register the final URL.

After the third attempt, a retryable failure also ends the delivery as failed.

## Auto-disable and re-enable

- A delivery that ends as failed adds 1 to the webhook's count of consecutive failures. A delivered one resets the count to 0.
- After **5 consecutive failed deliveries** the webhook disables itself and stops receiving events. No email is sent. The Watchlist page shows its state.
- Re-enable it with the "Re-enable" button on the Watchlist page. Re-enabling clears the count.
- Fix your endpoint first. You can press "Send test event" on a disabled webhook to check the endpoint before you re-enable it.

## Send test event

The "Send test event" button on the Watchlist page sends one `TEST` payload to the selected webhook.

- Allowed once per **60 seconds** per webhook. Within that time the API answers `429` with the seconds to wait.
- One attempt only, with no retries, so you see the result at once.
- It does not count toward the 5-failure auto-disable and does not reset the count.
- It is signed the same way as real events, with the same headers.

## Registering a URL

You can register up to **3 webhooks** per account. Every URL is checked when you add it and again before every attempt. A URL is rejected when it:

- is longer than 2048 characters or cannot be parsed,
- does not use `https` (plain `http` is refused),
- contains a username or password, a port other than 443, or a `#fragment`,
- ends with a dot, or is an IPv6 address,
- is an IP address in any notation (IPv4 dotted, decimal, hex),
- is `localhost` or ends in `.localhost`,
- is a single-label name such as `intranet`,
- ends in `.local`, `.internal`, `.lan`, `.home.arpa`, `.test`, `.invalid` or `.example`.

A public hostname that points to a private address cannot be detected by the sender. Do not register a name you do not control.

## Verification example (TypeScript, Web Crypto)

This example is a Cloudflare Worker handler. It also runs on Node 24, where `Request`, `Response` and `crypto.subtle` are global. It follows the same rules as AeroBrief's own `verifyWebhook`.

```ts
const TOLERANCE_SECONDS = 300;
const SIGNATURE_PATTERN = /^v1=[0-9a-f]{64}$/;
const encoder = new TextEncoder();

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Same checks as AeroBrief's verifyWebhook. `rawBody` must be the unmodified request text. */
async function verifyWebhook(opts: {
  secret: string; // the full "whsec_..." string
  timestamp: number;
  rawBody: string;
  signatureHeader: string;
  nowSeconds: number;
}): Promise<boolean> {
  const { secret, timestamp, rawBody, signatureHeader, nowSeconds } = opts;
  if (!SIGNATURE_PATTERN.test(signatureHeader)) return false;
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  // crypto.subtle.verify compares in constant time.
  return crypto.subtle.verify(
    "HMAC",
    key,
    fromHex(signatureHeader.slice("v1=".length)),
    encoder.encode(`${timestamp}.${rawBody}`),
  );
}

/** Replay store. Replace with KV (expirationTtl >= 600) or Redis (SET NX EX 600) in production. */
const seen = new Map<string, number>(); // deliveryId -> expiry (ms)
const REPLAY_TTL_MS = 10 * 60 * 1000;

function alreadySeen(deliveryId: string, nowMs: number): boolean {
  for (const [id, expires] of seen) if (expires <= nowMs) seen.delete(id);
  return seen.has(deliveryId);
}

export default {
  async fetch(request: Request, env: { AEROBRIEF_WEBHOOK_SECRET: string }): Promise<Response> {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    // Read the raw text once. Do not call request.json() before verifying.
    const rawBody = await request.text();

    const timestamp = Number(request.headers.get("X-AeroBrief-Timestamp"));
    const signatureHeader = request.headers.get("X-AeroBrief-Signature") ?? "";
    const deliveryId = request.headers.get("X-AeroBrief-Delivery") ?? "";
    const nowMs = Date.now();

    const ok = await verifyWebhook({
      secret: env.AEROBRIEF_WEBHOOK_SECRET,
      timestamp,
      rawBody,
      signatureHeader,
      nowSeconds: Math.floor(nowMs / 1000),
    });
    if (!ok) return new Response("Invalid signature", { status: 401 });

    // A repeat inside the window: acknowledge it, but do not process it again.
    if (alreadySeen(deliveryId, nowMs)) return new Response(null, { status: 204 });
    seen.set(deliveryId, nowMs + REPLAY_TTL_MS);

    const payload = JSON.parse(rawBody) as { type: string; text: string };
    // Queue the real work here and return at once.
    console.log(payload.type, payload.text);

    return new Response(null, { status: 204 });
  },
};
```

The in-memory `Map` in the example is lost when a Worker isolate restarts and is not shared between isolates. Use a shared store with a TTL of at least 600 seconds in production.

A `401` on a bad signature is a failed delivery for AeroBrief (it is not retried), so use it only for requests that really fail verification.

## Operations note: `WEBHOOK_MASTER_SECRET`

Each webhook secret is derived, not stored: `whsec_` plus the base64url of `HMAC-SHA256(WEBHOOK_MASTER_SECRET, "aerobrief.webhook.v1." + webhookId)`. The database holds no secret.

**Rotating `WEBHOOK_MASTER_SECRET` invalidates every webhook secret at once.** Every receiver fails verification until its owner has the new secret. The API never shows a secret twice, so an owner can only get a new one by deleting the webhook and creating it again.

For that reason `WEBHOOK_MASTER_SECRET` is **outside the rotation script** and is not covered by `docs/secret-rotation.md`. Do not rotate it unless you are ready to have every owner re-create their webhooks. A missing or too-short `WEBHOOK_MASTER_SECRET` makes the webhook routes answer `503`, naming only the variable.
