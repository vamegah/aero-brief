/**
 * Watchlist and account API calls. Same conventions as api/auth.ts: same-origin cookies,
 * 10 s timeout, failures reject with `ApiResponseError` (API error envelope) or
 * `ApiRequestError` (network, timeout, malformed body). Cap enforcement is the API's job.
 */
import { ApiResponseError, postJson } from "./auth";
import { ApiRequestError, REQUEST_TIMEOUT_MS } from "./client";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function requestJson(method: "GET" | "DELETE", path: string, signal?: AbortSignal): Promise<unknown> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: { Accept: "application/json" },
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
  return body;
}

function toWatchlist(body: unknown): string[] {
  if (!isRecord(body) || !Array.isArray(body["watchlist"]) || !body["watchlist"].every((id) => typeof id === "string")) {
    throw new ApiRequestError("Watchlist response had an unexpected shape.", 200);
  }
  return [...(body["watchlist"] as string[])];
}

/** GET /api/watchlist. A 401 rejects with status 401. */
export async function fetchWatchlist(signal?: AbortSignal): Promise<string[]> {
  return toWatchlist(await requestJson("GET", "/api/watchlist", signal));
}

/** POST /api/watchlist. Resolves with the updated list. A full list rejects with the API's 409 message. */
export async function addToWatchlist(airportId: string, signal?: AbortSignal): Promise<string[]> {
  return toWatchlist(await postJson("/api/watchlist", { airportId }, signal));
}

/** DELETE /api/watchlist/:code. Resolves with the updated list. */
export async function removeFromWatchlist(airportId: string, signal?: AbortSignal): Promise<string[]> {
  return toWatchlist(await requestJson("DELETE", `/api/watchlist/${encodeURIComponent(airportId)}`, signal));
}

/** DELETE /api/account. */
export async function deleteAccount(signal?: AbortSignal): Promise<void> {
  await requestJson("DELETE", "/api/account", signal);
}
