/**
 * Mutating API calls: sign-in, redeem, logout, unsubscribe. JSON body, same-origin cookies,
 * 10 s timeout. Failures reject with `ApiResponseError` (the API's `{ error: { code, message } }`
 * envelope) or `ApiRequestError` (network, timeout, malformed body).
 */
import { ApiRequestError, REQUEST_TIMEOUT_MS } from "./client";

export class ApiResponseError extends ApiRequestError {
  constructor(
    message: string,
    status: number,
    readonly code: string,
  ) {
    super(message, status);
    this.name = "ApiResponseError";
  }
}

export type UnsubscribeResult = { airportId: string; airportName: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/** Reads the error envelope from a non-2xx response, with a generic fallback. */
function toError(status: number, body: unknown): ApiResponseError {
  if (isRecord(body) && isRecord(body["error"])) {
    const { code, message } = body["error"];
    if (typeof code === "string" && typeof message === "string") {
      return new ApiResponseError(message, status, code);
    }
  }
  return new ApiResponseError(`The request failed (HTTP ${status}). Try again.`, status, "unknown");
}

/** POST a JSON body. Resolves with the parsed JSON body (undefined when absent). */
export async function postJson(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: signal === undefined ? timeout : AbortSignal.any([timeout, signal]),
    });
  } catch {
    throw new ApiRequestError("Could not reach the server. Check your connection and try again.", null);
  }
  const parsed = await readJson(response);
  if (!response.ok) throw toError(response.status, parsed);
  return parsed;
}

/** POST /api/auth/magic-link */
export async function requestMagicLink(email: string, signal?: AbortSignal): Promise<void> {
  await postJson("/api/auth/magic-link", { email }, signal);
}

/** POST /api/auth/redeem. Resolves with the signed-in email. */
export async function redeemMagicLink(token: string, signal?: AbortSignal): Promise<string> {
  const body = await postJson("/api/auth/redeem", { token }, signal);
  if (!isRecord(body) || typeof body["email"] !== "string") {
    throw new ApiRequestError("Sign-in response had an unexpected shape.", 200);
  }
  return body["email"];
}

/** POST /api/auth/logout */
export async function logout(signal?: AbortSignal): Promise<void> {
  await postJson("/api/auth/logout", {}, signal);
}

/** POST /api/unsubscribe */
export async function unsubscribe(
  params: { userId: string; airportId: string; sig: string },
  signal?: AbortSignal,
): Promise<UnsubscribeResult> {
  const body = await postJson("/api/unsubscribe", params, signal);
  if (!isRecord(body) || typeof body["airportId"] !== "string" || typeof body["airportName"] !== "string") {
    throw new ApiRequestError("Unsubscribe response had an unexpected shape.", 200);
  }
  return { airportId: body["airportId"], airportName: body["airportName"] };
}
