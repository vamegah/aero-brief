/**
 * Minimal Resend client (no SDK). Sends via POST https://api.resend.com/emails.
 * Idempotency header name confirmed against Resend docs
 * (https://resend.com/docs/dashboard/emails/idempotency-keys): HTTP API uses
 * `Idempotency-Key` (SMTP uses `Resend-Idempotency-Key`). Keys are 1-256 chars
 * and retained 24 h; a sha256 hex digest is 64 chars.
 */

export const RESEND_EMAILS_URL = "https://api.resend.com/emails";
export const SEND_TIMEOUT_MS = 10_000;
export const MAX_ATTEMPTS = 3;
/** Delay before attempt 2 and attempt 3. */
export const BACKOFF_MS: readonly number[] = [1_000, 2_000];

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;
export type SleepFn = (ms: number) => Promise<void>;

export interface EmailMessage {
  from: string;
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
}

export interface IdempotencyParts {
  eventKey: string;
  eventType: string;
  userId: string;
}

export interface SendEmailOptions {
  apiKey: string;
  message: EmailMessage;
  idempotency: IdempotencyParts;
  fetch?: FetchFn;
  sleep?: SleepFn;
  /** Called before each retry (attempts 2 and 3). Return false to stop retrying. */
  shouldRetry?: () => boolean | Promise<boolean>;
}

export type SendEmailResult =
  | { ok: true; id: string | null; attempts: number; idempotencyKey: string }
  | {
      ok: false;
      attempts: number;
      idempotencyKey: string;
      /** HTTP status of the last attempt, or null for timeout/network errors. */
      status: number | null;
      error: string;
    };

/** sha256 hex of `event_key:event_type:user_id` using Web Crypto. */
export async function idempotencyKey(parts: IdempotencyParts): Promise<string> {
  const data = new TextEncoder().encode(
    `${parts.eventKey}:${parts.eventType}:${parts.userId}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retry on timeout/network error, 429, 5xx, and 409 concurrent_idempotent_requests. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500 || status === 409;
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const doFetch: FetchFn = opts.fetch ?? ((input, init) => fetch(input, init));
  const sleep = opts.sleep ?? defaultSleep;
  const key = await idempotencyKey(opts.idempotency);
  const body = JSON.stringify(opts.message);

  let status: number | null = null;
  let error = "unknown";
  let attempts = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      await sleep(BACKOFF_MS[attempt - 2] ?? 2_000);
      if (opts.shouldRetry && !(await opts.shouldRetry())) break;
    }
    attempts = attempt;
    try {
      const res = await doFetch(RESEND_EMAILS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body,
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (res.ok) {
        let id: string | null = null;
        try {
          const json = (await res.json()) as { id?: unknown };
          if (typeof json.id === "string") id = json.id;
        } catch {
          // accepted without a parseable body; still a success
        }
        return { ok: true, id, attempts, idempotencyKey: key };
      }
      status = res.status;
      error = `http_status:${res.status}`;
      if (!isRetryableStatus(res.status)) break;
    } catch (err) {
      status = null;
      // Error names only; never include request headers or the API key.
      error = err instanceof Error && err.name === "TimeoutError" ? "timeout" : "network_error";
    }
  }

  return { ok: false, attempts, idempotencyKey: key, status, error };
}
