import { z } from "zod";

export interface Env {
  DATABASE_URL: string;
  RESEND_API_KEY: string;
  UNSUBSCRIBE_SECRET: string;
  FRONTEND_URL: string;
  MAIL_FROM: string;
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
