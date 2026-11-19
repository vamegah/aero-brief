import {
  buildTestPayload,
  deriveWebhookSecret,
  maskWebhookUrl,
  retryAfterSeconds,
  validateWebhookUrl,
} from "@aerobrief/core";
import { WebhookLimitError, createDb, createRepositories } from "@aerobrief/db";
import { sendWebhookOnce, type SenderFetch } from "@aerobrief/webhook-sender";
import { z } from "zod";
import type { Env } from "../env";
import { ApiError, jsonResponse } from "../http";
import type { Handler, Session } from "../router";
import { readWebhookConfig } from "../webhook-config";

/**
 * Webhook CRUD handlers (Requirements 13.3 to 13.8, 14.1). Auth, Origin and JSON checks are done by
 * the router. These handlers never log the URL or the secret and never return the URL.
 */

/** The only fields the API ever returns for a webhook. No `url`. */
export interface WebhookListItem {
  id: string;
  host: string;
  createdAt: Date;
  state: string;
  lastOutcome: string | null;
  lastOutcomeAt: Date | null;
  disabledAt: Date | null;
}

export interface WebhookRepos {
  webhooks: {
    list(userId: string): PromiseLike<readonly WebhookListItem[]>;
    /** Rejects with WebhookLimitError when the user already has 3. */
    insert(
      input: { id: string; userId: string; url: string; host: string },
      now: Date,
    ): Promise<WebhookListItem | undefined>;
    /** Resolves false when the webhook does not exist for this user. */
    delete(userId: string, webhookId: string): Promise<boolean>;
    /** Idempotent. Resolves undefined when the webhook does not exist for this user. */
    reenable(userId: string, webhookId: string): Promise<WebhookListItem | undefined>;
    /** Sender-facing row. Includes `url` and disabled webhooks. Never returned to clients. */
    getForSend?(
      userId: string,
      webhookId: string,
    ): PromiseLike<{ id: string; url: string; host: string; state: string; lastTestAt: Date | null } | undefined>;
    /** Atomic. True when the slot was claimed, false when rate-limited or not found. */
    claimTestSlot?(userId: string, webhookId: string, now: Date): Promise<boolean>;
    /** Stores `last_test_outcome` and nothing else. */
    recordTestOutcome?(userId: string, webhookId: string, outcome: "delivered" | "failed"): Promise<void>;
  };
}

export interface WebhookDeps {
  /** Builds repositories for a request. Defaults to Drizzle over `env.DATABASE_URL`. */
  repos?: (env: Env) => WebhookRepos;
  /** Generates a webhook id. Defaults to `crypto.randomUUID`. */
  newId?: () => string;
  /** Outbound fetch for the test event. Defaults to the global `fetch`. */
  fetch?: SenderFetch;
  /** Clock for the signed timestamp. Defaults to the request time. */
  now?: () => Date;
}

export interface WebhookHandlers {
  listWebhooks: Handler;
  createWebhook: Handler;
  deleteWebhook: Handler;
  reenableWebhook: Handler;
  testWebhook: Handler;
}

const createBodySchema = z.object({ url: z.string() });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function defaultRepos(env: Env): WebhookRepos {
  return { webhooks: createRepositories(createDb(env.DATABASE_URL)).webhooks };
}

function requireSession(session: Session | null): Session {
  if (session === null) throw new ApiError(401, "unauthorized", "Sign in to continue.");
  return session;
}

/** Copies the seven public fields, so nothing else a repository returns can reach a response. */
function publicItem(row: WebhookListItem): WebhookListItem {
  return {
    id: row.id,
    host: row.host,
    createdAt: row.createdAt,
    state: row.state,
    lastOutcome: row.lastOutcome,
    lastOutcomeAt: row.lastOutcomeAt,
    disabledAt: row.disabledAt,
  };
}

function notFound(): ApiError {
  return new ApiError(404, "not_found", "Webhook not found.");
}

export function createWebhookHandlers(deps: WebhookDeps = {}): WebhookHandlers {
  const reposFor = deps.repos ?? defaultRepos;
  const newId = deps.newId ?? ((): string => crypto.randomUUID());

  const listWebhooks: Handler = async (_req, env, ctx) => {
    const cfg = readWebhookConfig(ctx.rawEnv);
    if (!cfg.ok) return cfg.response;
    const session = requireSession(ctx.session);
    const rows = await reposFor(env).webhooks.list(session.userId);
    return jsonResponse(200, { webhooks: rows.map(publicItem) }, { "Cache-Control": "no-store" });
  };

  const createWebhook: Handler = async (_req, env, ctx) => {
    const cfg = readWebhookConfig(ctx.rawEnv);
    if (!cfg.ok) return cfg.response;
    const session = requireSession(ctx.session);
    const parsed = createBodySchema.safeParse(ctx.body);
    if (!parsed.success) {
      throw new ApiError(400, "invalid_request", "Body must be { url } with a string url.");
    }
    const checked = validateWebhookUrl(parsed.data.url);
    if (!checked.ok) {
      // Names the rule that failed, never the URL.
      throw new ApiError(400, "invalid_webhook_url", `This URL is not allowed (${checked.reason}).`);
    }
    // The id comes first because the secret is derived from it.
    const id = newId();
    const secret = await deriveWebhookSecret(cfg.config.masterSecret, id);
    let row: WebhookListItem | undefined;
    try {
      row = await reposFor(env).webhooks.insert(
        { id, userId: session.userId, url: checked.url, host: checked.host },
        ctx.now,
      );
    } catch (err) {
      if (err instanceof WebhookLimitError) {
        throw new ApiError(400, "webhook_limit", "You already have 3 webhooks. Delete one to add another.");
      }
      throw err;
    }
    if (row === undefined) throw new Error("webhook insert returned no row");
    return jsonResponse(201, { ...publicItem(row), secret }, { "Cache-Control": "no-store" });
  };

  const deleteWebhook: Handler = async (_req, env, ctx) => {
    const cfg = readWebhookConfig(ctx.rawEnv);
    if (!cfg.ok) return cfg.response;
    const session = requireSession(ctx.session);
    const id = ctx.params["id"];
    if (id === undefined || !UUID.test(id)) throw notFound();
    const deleted = await reposFor(env).webhooks.delete(session.userId, id);
    if (!deleted) throw notFound();
    return jsonResponse(200, { deleted: true });
  };

  /** Idempotent. The body is ignored; the client sends Content-Type: application/json and `{}`. */
  const reenableWebhook: Handler = async (_req, env, ctx) => {
    const cfg = readWebhookConfig(ctx.rawEnv);
    if (!cfg.ok) return cfg.response;
    const session = requireSession(ctx.session);
    const id = ctx.params["id"];
    if (id === undefined || !UUID.test(id)) throw notFound();
    const row = await reposFor(env).webhooks.reenable(session.userId, id);
    if (row === undefined) throw notFound();
    return jsonResponse(200, publicItem(row), { "Cache-Control": "no-store" });
  };

  /**
   * Test event (Requirement 18). Order: config, lookup, claim slot, allowlist, send, record outcome.
   * Writes no delivery row, leaves the failure counter alone, skips the stale gate and accepts a
   * disabled webhook. The body is ignored.
   */
  const testWebhook: Handler = async (_req, env, ctx) => {
    const cfg = readWebhookConfig(ctx.rawEnv);
    if (!cfg.ok) return cfg.response;
    const session = requireSession(ctx.session);
    const id = ctx.params["id"];
    if (id === undefined || !UUID.test(id)) throw notFound();
    const repo = reposFor(env).webhooks;
    const { getForSend, claimTestSlot, recordTestOutcome } = repo;
    if (getForSend === undefined || claimTestSlot === undefined || recordTestOutcome === undefined) {
      throw new Error("webhook repository lacks the test-event methods");
    }
    const row = await getForSend.call(repo, session.userId, id);
    if (row === undefined) throw notFound();

    const claimed = await claimTestSlot.call(repo, session.userId, id, ctx.now);
    if (!claimed) {
      // claimTestSlot is the authority. lastTestAt only sizes the wait.
      const wait = retryAfterSeconds(row.lastTestAt, ctx.now);
      ctx.logger.info("webhook_test_rate_limited", { webhookId: id, host: row.host });
      return jsonResponse(
        429,
        {
          error: { code: "rate_limited", message: "Send one test event per webhook per minute. Try again shortly." },
          retryAfterSeconds: wait,
        },
        { "Retry-After": String(wait), "Cache-Control": "no-store" },
      );
    }

    const host = maskWebhookUrl(row.url);
    let result: { outcome: "delivered" | "failed"; status?: number; errorKind?: string };
    if (cfg.config.safeSendMode && !cfg.config.safeSendHosts.includes(host.toLowerCase())) {
      result = { outcome: "failed", errorKind: "not_allowlisted" };
    } else {
      const secret = await deriveWebhookSecret(cfg.config.masterSecret, id);
      const deliveryId = newId();
      const body = JSON.stringify(buildTestPayload(deliveryId, ctx.now));
      const sent = await sendWebhookOnce({
        fetch: deps.fetch ?? ((url, init) => fetch(url, init)),
        url: row.url,
        secret,
        deliveryId,
        body,
        now: deps.now ?? ((): Date => ctx.now),
      });
      if ("status" in sent) {
        result =
          sent.status >= 200 && sent.status < 300
            ? { outcome: "delivered", status: sent.status }
            : { outcome: "failed", status: sent.status };
      } else {
        result = { outcome: "failed", errorKind: sent.errorKind };
      }
    }

    await recordTestOutcome.call(repo, session.userId, id, result.outcome);
    ctx.logger.info("webhook_test_sent", { webhookId: id, host, outcome: result.outcome });
    return jsonResponse(200, result, { "Cache-Control": "no-store" });
  };

  return { listWebhooks, createWebhook, deleteWebhook, reenableWebhook, testWebhook };
}
