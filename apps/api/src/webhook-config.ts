import {
  WEBHOOK_MASTER_MIN_LENGTH,
  isSafeSendMode,
  parseEmailAllowlist,
  parseHostAllowlist,
} from "@aerobrief/core";
import { z } from "zod";
import { errorResponse } from "./http";

/**
 * Webhook configuration, read from the raw Worker env at use. It is deliberately separate from
 * parseEnv, whose output the flags-off guard asserts. Only the webhook routes call it.
 */
const masterSecretSchema = z.string().min(WEBHOOK_MASTER_MIN_LENGTH);

export interface WebhookConfig {
  /** Never log or return this value. */
  masterSecret: string;
  safeSendMode: boolean;
  /** Lowercased, includes delivered@resend.dev. */
  safeSendEmails: string[];
  /** Lowercased. */
  safeSendHosts: string[];
}

export type WebhookConfigResult =
  | { ok: true; config: WebhookConfig }
  | { ok: false; response: Response };

function str(raw: Record<string, unknown>, key: string): string | undefined {
  const v = raw[key];
  return typeof v === "string" ? v : undefined;
}

/** 503 that names only the variable. No Retry-After: retrying does not fix a missing secret. */
export function webhookConfigUnavailable(): Response {
  return errorResponse(
    503,
    "webhooks_not_configured",
    "Webhooks are not configured: WEBHOOK_MASTER_SECRET is missing or too short.",
  );
}

export function readWebhookConfig(rawEnv: unknown): WebhookConfigResult {
  const raw: Record<string, unknown> =
    typeof rawEnv === "object" && rawEnv !== null ? (rawEnv as Record<string, unknown>) : {};
  const secret = masterSecretSchema.safeParse(str(raw, "WEBHOOK_MASTER_SECRET"));
  if (!secret.success) return { ok: false, response: webhookConfigUnavailable() };
  return {
    ok: true,
    config: {
      masterSecret: secret.data,
      safeSendMode: isSafeSendMode(str(raw, "SAFE_SEND_MODE")),
      safeSendEmails: parseEmailAllowlist(str(raw, "SAFE_SEND_ALLOWLIST_EMAILS")),
      safeSendHosts: parseHostAllowlist(str(raw, "SAFE_SEND_ALLOWLIST_HOSTS")),
    },
  };
}

/** Value to add to the logger redaction list, only when set and non-empty. */
export function webhookSecretToRedact(rawEnv: unknown): string | undefined {
  if (typeof rawEnv !== "object" || rawEnv === null) return undefined;
  const v = (rawEnv as Record<string, unknown>).WEBHOOK_MASTER_SECRET;
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
