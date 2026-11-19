import { signWebhook, validateWebhookUrl } from "@aerobrief/core";

/** Largest body the sender will post, in bytes (design: webhook payload section). */
export const MAX_WEBHOOK_BODY_BYTES = 4096;
/** Per-attempt request timeout in milliseconds (Req 14.7). */
export const WEBHOOK_TIMEOUT_MS = 5000;

export type SendErrorKind = "timeout" | "network" | "blocked_url" | "invalid_payload";

export type SendResult = { status: number } | { errorKind: SendErrorKind };

/** The slice of a fetch Response the sender touches. */
export interface SenderResponse {
  status: number;
  body?: { cancel(): Promise<unknown> | unknown } | null;
}

export interface SenderRequestInit {
  method: "POST";
  redirect: "manual";
  signal: AbortSignal;
  headers: Record<string, string>;
  body: string;
}

export type SenderFetch = (url: string, init: SenderRequestInit) => Promise<SenderResponse>;

export interface SendWebhookInput {
  fetch: SenderFetch;
  url: string;
  secret: string;
  deliveryId: string;
  body: string;
  /** Clock. Read once per attempt to produce the signed Unix-seconds timestamp. */
  now: () => Date;
}

function isTimeout(err: unknown): boolean {
  const name = (err as { name?: unknown } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

/**
 * One delivery attempt. Revalidates the stored URL, signs with a fresh timestamp,
 * posts without following redirects, and drops the response body unread.
 * Returns only a status or an error kind; it never logs or returns the URL,
 * the secret or any response detail (Req 14.5 to 14.9, 15.3, 15.4, 16.8).
 */
export async function sendWebhookOnce(input: SendWebhookInput): Promise<SendResult> {
  const { fetch, url, secret, deliveryId, body, now } = input;

  if (typeof body !== "string" || new TextEncoder().encode(body).length > MAX_WEBHOOK_BODY_BYTES) {
    return { errorKind: "invalid_payload" };
  }

  const checked = validateWebhookUrl(url);
  if (!checked.ok) return { errorKind: "blocked_url" };

  const timestamp = Math.floor(now().getTime() / 1000);

  let response: SenderResponse;
  try {
    const signature = await signWebhook(secret, timestamp, body);
    response = await fetch(checked.url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        "X-AeroBrief-Delivery": deliveryId,
        "X-AeroBrief-Timestamp": String(timestamp),
        "X-AeroBrief-Signature": signature,
      },
      body,
    });
  } catch (err) {
    return { errorKind: isTimeout(err) ? "timeout" : "network" };
  }

  try {
    await response.body?.cancel();
  } catch {
    // The status is already known; a failed cancel changes nothing.
  }
  return { status: response.status };
}
