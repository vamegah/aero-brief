/**
 * Daily digest API calls (Phase 2, behind the `digests` flag). Same conventions as api/watchlist.ts:
 * same-origin cookies, 10 s timeout, failures reject with `ApiResponseError` or `ApiRequestError`.
 */
import { ApiResponseError } from "./auth";
import { ApiRequestError, REQUEST_TIMEOUT_MS } from "./client";
import { requestJson } from "./watchlist";

export type DigestPreference = { enabled: boolean; hour: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toPreference(body: unknown): DigestPreference {
  if (
    isRecord(body) &&
    typeof body["enabled"] === "boolean" &&
    typeof body["hour"] === "number" &&
    Number.isInteger(body["hour"]) &&
    body["hour"] >= 0 &&
    body["hour"] <= 23
  ) {
    return { enabled: body["enabled"], hour: body["hour"] };
  }
  throw new ApiRequestError("Digest response had an unexpected shape.", 200);
}

/** GET /api/digest */
export async function fetchDigest(signal?: AbortSignal): Promise<DigestPreference> {
  return toPreference(await requestJson("GET", "/api/digest", signal));
}

/** PUT /api/digest. Sends exactly `{ enabled, hour }`. */
export async function saveDigest(preference: DigestPreference, signal?: AbortSignal): Promise<DigestPreference> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch("/api/digest", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ enabled: preference.enabled, hour: preference.hour }),
      signal: signal === undefined ? timeout : AbortSignal.any([timeout, signal]),
    });
  } catch {
    throw new ApiRequestError("Could not reach the server. Check your connection and try again.", null);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  if (!response.ok) {
    if (isRecord(body) && isRecord(body["error"])) {
      const { code, message } = body["error"];
      if (typeof code === "string" && typeof message === "string") {
        throw new ApiResponseError(message, response.status, code);
      }
    }
    throw new ApiResponseError(`The request failed (HTTP ${response.status}). Try again.`, response.status, "unknown");
  }
  return toPreference(body);
}
