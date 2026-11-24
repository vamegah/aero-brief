import { RELAY_KEY_HEADER, parseFaaBody, type FaaResponse } from "@aerobrief/core";

/** The only host the poller may call (Requirement 1.2). Matches FAA_API in requirements.md. */
export const FAA_API_URL = "https://nasstatus.faa.gov/api/airport-events";

export const FAA_TIMEOUT_MS = 10_000;

const MAX_DETAIL_CHARS = 200;

export type FaaFailureKind = "timeout" | "http_status" | "network" | "unparseable" | "validation";

export type FaaFetchResult =
  | { ok: true; response: FaaResponse; fetchedAt?: string }
  | { ok: false; kind: FaaFailureKind; detail: string };

export type FetchFn = (
  input: string,
  init: { signal: AbortSignal; headers?: Record<string, string> },
) => Promise<Response>;

/** A validated relay config, as returned by `resolveRelayConfig` in relay mode. */
export type RelayTarget = { url: string; secret: string };

function truncate(text: string, max = MAX_DETAIL_CHARS): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

const MIN_LEAK_CHARS = 8;

/**
 * Replace the secret, and any run of 8 or more characters that is a substring of it,
 * with [REDACTED]. Runs before truncation so a cut cannot leave a partial secret.
 */
export function scrubSecret(text: string, secret: string | undefined): string {
  if (!secret || secret.length < MIN_LEAK_CHARS) return text;
  const covered = new Array<boolean>(text.length).fill(false);
  for (let i = 0; i + MIN_LEAK_CHARS <= text.length; i++) {
    if (secret.includes(text.slice(i, i + MIN_LEAK_CHARS))) {
      for (let j = i; j < i + MIN_LEAK_CHARS; j++) covered[j] = true;
    }
  }
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (!covered[i]) out += text[i];
    else if (i === 0 || !covered[i - 1]) out += "[REDACTED]";
  }
  return out;
}

/** String(value) that cannot throw (e.g. `toString: ""` or a Symbol.toPrimitive that throws). */
function safeString(value: unknown): string {
  try {
    return String(value);
  } catch {
    return "unknown error";
  }
}

/** Read a string property without ever throwing (a getter may throw). */
function readStringProp(err: unknown, key: "name" | "message"): string | undefined {
  try {
    if (typeof err === "object" && err !== null && key in err) {
      const v = (err as Record<string, unknown>)[key];
      if (typeof v === "string") return v;
    }
  } catch {
    // fall through
  }
  return undefined;
}

function errorName(err: unknown): string {
  return readStringProp(err, "name") ?? "UnknownError";
}

function errorMessage(err: unknown): string {
  return readStringProp(err, "message") ?? safeString(err);
}

/**
 * Classify a thrown fetch/body-read error. AbortSignal.timeout() aborts with a
 * "TimeoutError" DOMException. "AbortError" is also treated as a timeout because
 * the timeout signal is the only signal this module passes to fetch.
 * Other rejections (DNS, connection reset) are reported as `network`.
 */
function classifyThrown(err: unknown, secret?: string): FaaFetchResult {
  const name = errorName(err);
  if (name === "TimeoutError" || name === "AbortError") {
    return { ok: false, kind: "timeout", detail: `FAA request exceeded ${FAA_TIMEOUT_MS} ms` };
  }
  return { ok: false, kind: "network", detail: truncate(scrubSecret(`${name}: ${errorMessage(err)}`, secret)) };
}

/** Fetch and validate the FAA airport events. Never throws. */
export async function fetchFaa(
  fetchFn: FetchFn = (input, init) => fetch(input, init),
  relay?: RelayTarget,
): Promise<FaaFetchResult> {
  try {
    const res = relay
      ? await fetchFn(relay.url, {
          signal: AbortSignal.timeout(FAA_TIMEOUT_MS),
          headers: { [RELAY_KEY_HEADER]: relay.secret, Accept: "application/json" },
        })
      : await fetchFn(FAA_API_URL, { signal: AbortSignal.timeout(FAA_TIMEOUT_MS) });
    if (!res.ok) {
      return { ok: false, kind: "http_status", detail: `HTTP ${res.status}` };
    }
    const text = await res.text();
    const parsed = parseFaaBody(text);
    if (parsed.kind === "ok") {
      return { ok: true, response: parsed.response, fetchedAt: new Date().toISOString() };
    }
    return { ok: false, kind: parsed.kind, detail: truncate(scrubSecret(parsed.detail, relay?.secret)) };
  } catch (err) {
    return classifyThrown(err, relay?.secret);
  }
}
