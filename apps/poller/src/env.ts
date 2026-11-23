import { z } from "zod";

export interface Env {
  DATABASE_URL: string;
  RESEND_API_KEY: string;
  UNSUBSCRIBE_SECRET: string;
  FRONTEND_URL: string;
  MAIL_FROM: string;
  /** Phase 2 flags and webhook settings. Read raw by the webhook code; not validated by parseEnv. */
  FEATURE_DARK_MODE?: string;
  FEATURE_HIGH_CONTRAST?: string;
  FEATURE_DIGESTS?: string;
  FEATURE_WEBHOOKS?: string;
  WEBHOOK_MASTER_SECRET?: string;
  SAFE_SEND_MODE?: string;
  SAFE_SEND_ALLOWLIST_EMAILS?: string;
  SAFE_SEND_ALLOWLIST_HOSTS?: string;
  /** Optional FAA relay settings. Read raw by runPoll and validated by resolveRelayConfig, not by parseEnv. */
  FAA_RELAY_URL?: string;
  FAA_RELAY_SECRET?: string;
}

export const envSchema = z.object({
  DATABASE_URL: z.url(),
  RESEND_API_KEY: z.string().min(1),
  UNSUBSCRIBE_SECRET: z.string().min(1),
  FRONTEND_URL: z.url(),
  MAIL_FROM: z.string().min(1),
});

/**
 * Validates the Worker env. On failure throws an Error that names only the
 * offending keys, never their values (Requirement 14.10).
 */
export function parseEnv(env: unknown): Env {
  const result = envSchema.safeParse(env);
  if (result.success) return result.data;
  const keys = [...new Set(result.error.issues.map((i) => String(i.path[0] ?? "(env)")))];
  throw new Error(`Invalid or missing environment variables: ${keys.join(", ")}`);
}
