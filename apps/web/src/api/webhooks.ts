/**
 * Webhook API calls (Phase 2, behind the `webhooks` flag). Same conventions as api/watchlist.ts:
 * same-origin cookies, 10 s timeout, failures reject with `ApiResponseError` or `ApiRequestError`.
 * The API returns only the host name of each webhook, never the full URL.
 */
import { ApiResponseError, postJson } from "./auth";
import { ApiRequestError } from "./client";
import { requestJson } from "./watchlist";

export type WebhookItem = {
  id: string;
  host: string;
  createdAt: string;
  state: "active" | "disabled";
  lastOutcome: string | null;
  lastOutcomeAt: string | null;
  disabledAt: string | null;
};

export type CreatedWebhook = WebhookItem & { secret: string };

export type TestResult = { outcome: "delivered" | "failed"; status: number | null; errorKind: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null | undefined {
  return value === null || value === undefined ? null : typeof value === "string" ? value : undefined;
}

function toItem(value: unknown): WebhookItem {
  if (isRecord(value)) {
    const lastOutcome = nullableString(value["lastOutcome"]);
    const lastOutcomeAt = nullableString(value["lastOutcomeAt"]);
    const disabledAt = nullableString(value["disabledAt"]);
    const { id, host, createdAt, state } = value;
    if (
      typeof id === "string" &&
      typeof host === "string" &&
      typeof createdAt === "string" &&
      (state === "active" || state === "disabled") &&
      lastOutcome !== undefined &&
      lastOutcomeAt !== undefined &&
      disabledAt !== undefined
    ) {
      return { id, host, createdAt, state, lastOutcome, lastOutcomeAt, disabledAt };
    }
  }
  throw new ApiRequestError("Webhook response had an unexpected shape.", 200);
}

function path(id: string, suffix = ""): string {
  return `/api/webhooks/${encodeURIComponent(id)}${suffix}`;
}

/** GET /api/webhooks */
export async function fetchWebhooks(signal?: AbortSignal): Promise<WebhookItem[]> {
  const body = await requestJson("GET", "/api/webhooks", signal);
  if (!isRecord(body) || !Array.isArray(body["webhooks"])) {
    throw new ApiRequestError("Webhook response had an unexpected shape.", 200);
  }
  return body["webhooks"].map(toItem);
}

/** POST /api/webhooks. The secret is in this response only. */
export async function createWebhook(url: string, signal?: AbortSignal): Promise<CreatedWebhook> {
  const body = await postJson("/api/webhooks", { url }, signal);
  if (!isRecord(body) || typeof body["secret"] !== "string") {
    throw new ApiRequestError("Webhook response had an unexpected shape.", 200);
  }
  return { ...toItem(body), secret: body["secret"] };
}

/** DELETE /api/webhooks/:id */
export async function deleteWebhook(id: string, signal?: AbortSignal): Promise<void> {
  await requestJson("DELETE", path(id), signal);
}

/** POST /api/webhooks/:id/reenable */
export async function reenableWebhook(id: string, signal?: AbortSignal): Promise<WebhookItem> {
  return toItem(await postJson(path(id, "/reenable"), {}, signal));
}

/** POST /api/webhooks/:id/test. A 429 rejects with `ApiResponseError` (status 429). */
export async function sendTestEvent(id: string, signal?: AbortSignal): Promise<TestResult> {
  const body = await postJson(path(id, "/test"), {}, signal);
  if (!isRecord(body) || (body["outcome"] !== "delivered" && body["outcome"] !== "failed")) {
    throw new ApiRequestError("Test event response had an unexpected shape.", 200);
  }
  return {
    outcome: body["outcome"],
    status: typeof body["status"] === "number" ? body["status"] : null,
    errorKind: typeof body["errorKind"] === "string" ? body["errorKind"] : null,
  };
}

export { ApiResponseError };
