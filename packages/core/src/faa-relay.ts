/**
 * Pure logic for the FAA relay (Vercel Function) and the poller's relay mode.
 * No I/O, no env, no network. Values come in as arguments.
 * Spec: .kiro/specs/faa-403-poller/design.md.
 */
import { z } from "zod";

export const RELAY_KEY_HEADER = "x-aerobrief-relay-key";
export const RELAY_TARGET_URL = "https://nasstatus.faa.gov/api/airport-events";
export const RELAY_ALLOWED_HOST = "www.aerobriefs.com";
export const RELAY_ALLOWED_PATH = "/api/internal/faa-relay";
export const RELAY_SECRET_MIN_LENGTH = 32;
export const RELAY_TIMEOUT_MS = 10_000;
export const RELAY_MAX_BODY_BYTES = 1_048_576;
export const RELAY_ERROR_BODY_CHARS = 300;

/** Compares two strings without stopping at the first difference. */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) {
    // charCodeAt past the end gives NaN; `| 0` turns it into 0.
    diff |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  }
  return diff === 0;
}

export const relayEnvSchema = z.object({
  FAA_RELAY_SECRET: z.string().min(RELAY_SECRET_MIN_LENGTH),
});

export type RelayDecision =
  | { action: "fetch" }
  | { action: "reject"; status: 401 | 405 | 500; error: string };

export interface RelayRequestInput {
  method: string;
  providedKey: string | null | undefined;
  secret: string | undefined;
}

/** Order: misconfigured secret (500), method (405), key (401), then fetch. */
export function decideRelayRequest(input: RelayRequestInput): RelayDecision {
  if (!relayEnvSchema.safeParse({ FAA_RELAY_SECRET: input.secret }).success) {
    return { action: "reject", status: 500, error: "relay_misconfigured" };
  }
  if (input.method !== "GET") {
    return { action: "reject", status: 405, error: "method_not_allowed" };
  }
  const secret = input.secret as string;
  const provided = input.providedKey ?? "";
  if (provided === "" || !timingSafeEqualStrings(provided, secret)) {
    return { action: "reject", status: 401, error: "unauthorized" };
  }
  return { action: "fetch" };
}

export interface RelayShapedResponse {
  status: number;
  contentType: string;
  body: string;
}

/** 2xx: pass the body as JSON. Otherwise: same status and a short text excerpt. */
export function shapeRelayResponse(input: { upstreamStatus: number; bodyText: string }): RelayShapedResponse {
  if (input.upstreamStatus >= 200 && input.upstreamStatus <= 299) {
    return { status: input.upstreamStatus, contentType: "application/json", body: input.bodyText };
  }
  return {
    status: input.upstreamStatus,
    contentType: "text/plain",
    body: input.bodyText.slice(0, RELAY_ERROR_BODY_CHARS),
  };
}

export type RelayConfigKey = "FAA_RELAY_URL" | "FAA_RELAY_SECRET";

export type RelayConfig =
  | { mode: "direct" }
  | { mode: "relay"; url: string; secret: string }
  | { mode: "invalid"; keys: RelayConfigKey[] };

function isValidRelayUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    parsed.hostname === RELAY_ALLOWED_HOST &&
    parsed.username === "" &&
    parsed.password === "" &&
    parsed.port === "" &&
    parsed.pathname === RELAY_ALLOWED_PATH &&
    parsed.search === "" &&
    parsed.hash === ""
  );
}

/**
 * Both unset (undefined or empty): direct. One set: invalid. Both set: valid
 * only for the fixed relay URL and a secret of at least 32 characters.
 * Rejected values are never echoed; only the setting names are returned.
 */
export function resolveRelayConfig(input: {
  url: string | undefined;
  secret: string | undefined;
}): RelayConfig {
  const url = input.url ?? "";
  const secret = input.secret ?? "";
  if (url === "" && secret === "") return { mode: "direct" };
  const keys: RelayConfigKey[] = [];
  if (url === "" || !isValidRelayUrl(url)) keys.push("FAA_RELAY_URL");
  if (secret.length < RELAY_SECRET_MIN_LENGTH) keys.push("FAA_RELAY_SECRET");
  if (keys.length > 0) return { mode: "invalid", keys };
  return { mode: "relay", url, secret };
}
