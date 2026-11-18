import { parseIsoInstant } from "@aerobrief/core";
import { z } from "zod";

export interface Env {
  DATABASE_URL: string;
  RESEND_API_KEY: string;
  UNSUBSCRIBE_SECRET: string;
  FRONTEND_URL: string;
  MAIL_FROM: string;
  /** Optional. Verify-only secret kept during rotation. */
  UNSUBSCRIBE_SECRET_PREVIOUS?: string | undefined;
  /** Optional ISO instant. Absent when unset or malformed (parseEnv drops malformed values). */
  UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT?: string | undefined;
}

export const envSchema = z.object({
  DATABASE_URL: z.url(),
  RESEND_API_KEY: z.string().min(1),
  UNSUBSCRIBE_SECRET: z.string().min(1),
  FRONTEND_URL: z.url(),
  MAIL_FROM: z.string().min(1),
  // Optional values never fail startup; a bad expiry is dropped in parseEnv.
  UNSUBSCRIBE_SECRET_PREVIOUS: z.string().optional().catch(undefined),
  UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT: z.string().optional().catch(undefined),
});

/** True when an expiry value was supplied but is not a valid ISO instant. */
export function isMalformedPreviousExpiry(raw: unknown): boolean {
  const value = typeof raw === "object" && raw !== null
    ? (raw as Record<string, unknown>)["UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT"]
    : undefined;
  if (value === undefined || value === "") return false;
  return typeof value !== "string" || parseIsoInstant(value) === null;
}

/**
 * Validates the Worker env. On failure throws an Error that names only the
 * offending keys, never their values (Requirement 14.10).
 */
export function parseEnv(env: unknown): Env {
  const result = envSchema.safeParse(env);
  if (result.success) {
    const data = result.data;
    if (parseIsoInstant(data.UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT) === null) {
      data.UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT = undefined;
    }
    if (data.UNSUBSCRIBE_SECRET_PREVIOUS === "") data.UNSUBSCRIBE_SECRET_PREVIOUS = undefined;
    return data;
  }
  const keys = [...new Set(result.error.issues.map((i) => String(i.path[0] ?? "(env)")))];
  throw new Error(`Invalid or missing environment variables: ${keys.join(", ")}`);
}
