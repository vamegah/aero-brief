import { parseFaaBody, type FaaResponse } from "@aerobrief/core";

/** The only host the poller may call (Requirement 1.2). Matches FAA_API in requirements.md. */
export const FAA_API_URL = "https://nasstatus.faa.gov/api/airport-events";

export const FAA_TIMEOUT_MS = 10_000;

const MAX_DETAIL_CHARS = 200;

export type FaaFailureKind = "timeout" | "http_status" | "network" | "unparseable" | "validation";

export type FaaFetchResult =
  | { ok: true; response: FaaResponse; fetchedAt?: string }
  | { ok: false; kind: FaaFailureKind; detail: string };

export type FetchFn = (input: string, init: { signal: AbortSignal }) => Promise<Response>;

function truncate(text: string, max = MAX_DETAIL_CHARS): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function errorName(err: unknown): string {
  if (typeof err === "object" && err !== null && "name" in err) return String((err as { name: unknown }).name);
  return "UnknownError";
}

function errorMessage(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

/**
 * Classify a thrown fetch/body-read error. AbortSignal.timeout() aborts with a
 * "TimeoutError" DOMException. "AbortError" is also treated as a timeout because
 * the timeout signal is the only signal this module passes to fetch.
 * Other rejections (DNS, connection reset) are reported as `network`.
 */
function classifyThrown(err: unknown): FaaFetchResult {
  const name = errorName(err);
  if (name === "TimeoutError" || name === "AbortError") {
    return { ok: false, kind: "timeout", detail: `FAA request exceeded ${FAA_TIMEOUT_MS} ms` };
  }
  return { ok: false, kind: "network", detail: truncate(`${name}: ${errorMessage(err)}`) };
}

/** Fetch and validate the FAA airport events. Never throws. */
export async function fetchFaa(fetchFn: FetchFn = (input, init) => fetch(input, init)): Promise<FaaFetchResult> {
  try {
    const res = await fetchFn(FAA_API_URL, { signal: AbortSignal.timeout(FAA_TIMEOUT_MS) });
    if (!res.ok) {
      return { ok: false, kind: "http_status", detail: `HTTP ${res.status}` };
    }
    const text = await res.text();
    const parsed = parseFaaBody(text);
    if (parsed.kind === "ok") {
      return { ok: true, response: parsed.response, fetchedAt: new Date().toISOString() };
    }
    return { ok: false, kind: parsed.kind, detail: truncate(parsed.detail) };
  } catch (err) {
    return classifyThrown(err);
  }
}
