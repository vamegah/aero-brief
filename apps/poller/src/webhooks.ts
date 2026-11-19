import {
  buildWebhookPayload,
  classifyAttempt,
  createLogger,
  deriveWebhookSecret,
  filterAllowlisted,
  isSafeSendMode,
  isStale,
  maskWebhookUrl,
  nextStep,
  parseHostAllowlist,
  webhookPayloadSchema,
  WEBHOOK_MASTER_MIN_LENGTH,
  type AttemptResult,
  type DetectedEvent,
  type Logger,
} from "@aerobrief/core";
import { createDb, createRepositories, type Repositories } from "@aerobrief/db";
import { sendWebhookOnce, type SenderFetch, type SendResult } from "@aerobrief/webhook-sender";
import type { Env } from "./env";
import { readFlags } from "./features";
import type { NotifierEvent, NotifierRepositories } from "./notifier";

/** Delivery concurrency (design: Delivery flow). */
export const WEBHOOK_CONCURRENCY = 20;

/** Recorded in webhook_deliveries.last_error_kind for a Safe_Send_Mode skip. */
export const NOT_ALLOWLISTED = "not_allowlisted";

/** A newly inserted Event, with the stored detector output needed to build the payload. */
export type WebhookEvent = NotifierEvent & { payload: unknown };

export type WebhookRepositories = {
  snapshots: NotifierRepositories["snapshots"];
  subscriptions: NotifierRepositories["subscriptions"];
  webhooks: Pick<
    Repositories["webhooks"],
    "activeForSender" | "claimDelivery" | "completeDelivery" | "recordOutcome"
  >;
};

export type WebhookDeps = {
  /** Builds the repositories from DATABASE_URL. Called only after every gate has passed. */
  createRepositories?: (databaseUrl: string) => WebhookRepositories;
  fetchFn?: SenderFetch;
  /** Retry wait. Injectable so tests use fake timers or an instant sleep. */
  sleep?: (ms: number) => Promise<void>;
  clock?: () => Date;
  logger?: Logger;
  concurrency?: number;
  newDeliveryId?: () => string;
};

export type WebhookSummary = {
  /** Why nothing was attempted, or null when the run proceeded. */
  skippedReason: "flag_off" | "no_master_secret" | "stale_snapshot" | "no_events" | null;
  claimed: number;
  delivered: number;
  failed: number;
  skipped: number;
};

type Recipient = { userId: string; email: string };
type SenderWebhook = { id: string; userId: string; url: string; host: string };
type Job = { event: WebhookEvent; webhook: SenderWebhook; deliveryId: string };

const ALERT_TYPES = new Set(["GROUND_STOP_STARTED", "GROUND_STOP_ENDED", "NATIONWIDE_EVENT"]);

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const defaultFetch: SenderFetch = (url, init) => fetch(url, init);

function str(env: object, key: string): string | undefined {
  const v = (env as Record<string, unknown>)[key];
  return typeof v === "string" ? v : undefined;
}

/**
 * Sends webhooks for newly inserted Events (Requirements 16.1-16.9, 16.13, 16.14, 16.17).
 * Runs after notify() returns. Never throws: any failure is logged and alert emails are untouched.
 * `now` is the time the Snapshot was stored; it is the start of the first-attempt delay (16.2).
 */
export async function dispatchWebhooks(
  env: Env,
  events: readonly WebhookEvent[],
  now: Date,
  deps: WebhookDeps = {},
): Promise<WebhookSummary> {
  const summary: WebhookSummary = { skippedReason: null, claimed: 0, delivered: 0, failed: 0, skipped: 0 };
  const master = str(env, "WEBHOOK_MASTER_SECRET");
  const logger =
    deps.logger ?? createLogger([env.DATABASE_URL, env.RESEND_API_KEY, env.UNSUBSCRIBE_SECRET, master ?? ""]);
  try {
    // Flag gate first, so a flag-off run makes no query and no request.
    if (!readFlags(env, logger).FEATURE_WEBHOOKS) return { ...summary, skippedReason: "flag_off" };
    if (events.length === 0) return { ...summary, skippedReason: "no_events" };

    // Requirement 13.12: a missing or short master secret sends nothing and logs one error.
    if (master === undefined || master.length < WEBHOOK_MASTER_MIN_LENGTH) {
      logger.error("webhook_master_secret_unavailable", { variable: "WEBHOOK_MASTER_SECRET" });
      return { ...summary, skippedReason: "no_master_secret" };
    }

    const clock = deps.clock ?? (() => new Date());
    const repos = (deps.createRepositories ?? defaultRepositories)(env.DATABASE_URL);

    // Requirement 16.13: no webhook while the latest Snapshot is stale or missing. Fail safe on error.
    const latest = await repos.snapshots.latestSnapshot(clock());
    if (latest === null || isStale(latest.capturedAt, clock())) {
      return { ...summary, skippedReason: "stale_snapshot" };
    }

    const recipientsByEvent = await selectRecipients(repos, events, logger);
    const userIds = [...new Set([...recipientsByEvent.values()].flatMap((r) => r.map((x) => x.userId)))];
    if (userIds.length === 0) return summary;

    const active = await repos.webhooks.activeForSender(userIds);
    const byUser = new Map<string, SenderWebhook[]>();
    for (const w of active) byUser.set(w.userId, [...(byUser.get(w.userId) ?? []), w]);

    const safeSend = isSafeSendMode(str(env, "SAFE_SEND_MODE"));
    const hostAllowlist = parseHostAllowlist(str(env, "SAFE_SEND_ALLOWLIST_HOSTS"));
    const newId = deps.newDeliveryId ?? (() => crypto.randomUUID());
    const limit = deps.concurrency ?? WEBHOOK_CONCURRENCY;

    const pairs: { event: WebhookEvent; webhook: SenderWebhook }[] = [];
    for (const [event, recipients] of recipientsByEvent) {
      const seen = new Set<string>();
      for (const r of recipients) {
        if (seen.has(r.userId)) continue;
        seen.add(r.userId);
        for (const webhook of byUser.get(r.userId) ?? []) pairs.push({ event, webhook });
      }
    }

    // One claim per (webhook, event key, event type); only claimed pairs proceed (Requirement 16.3).
    const claimed: Job[] = [];
    await runPool(pairs, limit, async ({ event, webhook }) => {
      const deliveryId = newId();
      try {
        const won = await repos.webhooks.claimDelivery(
          { id: deliveryId, webhookId: webhook.id, eventKey: event.eventKey, eventType: event.type },
          clock(),
        );
        if (won) claimed.push({ event, webhook, deliveryId });
      } catch (err) {
        logger.error("webhook_claim_failed", { webhookId: webhook.id, error: err });
      }
    });
    summary.claimed = claimed.length;

    const allowed = new Set(
      safeSend ? filterAllowlisted(claimed, hostAllowlist, (j) => j.webhook.host).map((j) => j.deliveryId) : claimed.map((j) => j.deliveryId),
    );
    const ctx: RunContext = {
      repos,
      logger,
      clock,
      master,
      sleep: deps.sleep ?? defaultSleep,
      fetchFn: deps.fetchFn ?? defaultFetch,
      storedAt: now,
    };
    await runPool(claimed, limit, async (job) => {
      try {
        const outcome = allowed.has(job.deliveryId) ? await runDelivery(ctx, job) : await skipDelivery(ctx, job);
        summary[outcome === "delivered" ? "delivered" : outcome === "failed" ? "failed" : "skipped"]++;
      } catch (err) {
        // One broken delivery must not stop the others (Requirement 16.14).
        logger.error("webhook_delivery_threw", {
          deliveryId: job.deliveryId,
          webhookId: job.webhook.id,
          host: maskWebhookUrl(job.webhook.url),
          error: err,
        });
      }
    });
    return summary;
  } catch (err) {
    logger.error("webhook_dispatch_failed", { error: err });
    return summary;
  }
}

type RunContext = {
  repos: WebhookRepositories;
  logger: Logger;
  clock: () => Date;
  master: string;
  sleep: (ms: number) => Promise<void>;
  fetchFn: SenderFetch;
  storedAt: Date;
};

type FinalOutcome = "delivered" | "failed" | "skipped";

async function skipDelivery(ctx: RunContext, job: Job): Promise<FinalOutcome> {
  await finish(ctx, job, { outcome: "skipped", attempts: 0, lastErrorKind: NOT_ALLOWLISTED }, null);
  return "skipped";
}

async function runDelivery(ctx: RunContext, job: Job): Promise<FinalOutcome> {
  const { event, webhook, deliveryId } = job;
  let body: string;
  try {
    const payload = buildWebhookPayload(event.payload as DetectedEvent, deliveryId, event.eventKey);
    const parsed = webhookPayloadSchema.safeParse(payload);
    if (!parsed.success) throw new Error("invalid_payload");
    body = JSON.stringify(parsed.data);
  } catch {
    await finish(ctx, job, { outcome: "failed", attempts: 0, lastErrorKind: "invalid_payload" }, null);
    return "failed";
  }

  const secret = await deriveWebhookSecret(ctx.master, webhook.id);
  let attempts = 0;
  let firstAttemptDelayMs: number | null = null;
  for (;;) {
    attempts++;
    if (firstAttemptDelayMs === null) firstAttemptDelayMs = ctx.clock().getTime() - ctx.storedAt.getTime();
    const result: SendResult = await sendWebhookOnce({
      fetch: ctx.fetchFn,
      url: webhook.url,
      secret,
      deliveryId,
      body,
      now: ctx.clock,
    });
    const step = nextStep(attempts, classifyAttempt(result as AttemptResult));
    if (step.done) {
      await finish(
        ctx,
        job,
        {
          outcome: step.outcome,
          attempts,
          lastStatus: "status" in result ? result.status : null,
          lastErrorKind: "errorKind" in result ? result.errorKind : null,
        },
        firstAttemptDelayMs,
      );
      return step.outcome;
    }
    await ctx.sleep(step.waitMs);
  }
}

/** Writes the delivery row, applies the outcome to the failure counter and logs it. */
async function finish(
  ctx: RunContext,
  job: Job,
  result: { outcome: FinalOutcome; attempts: number; lastStatus?: number | null; lastErrorKind?: string | null },
  firstAttemptDelayMs: number | null,
): Promise<void> {
  const { repos, logger, clock } = ctx;
  const { webhook, deliveryId } = job;
  await repos.webhooks.completeDelivery(deliveryId, result, clock());
  // No email or other notification is sent when this disables the webhook (Requirement 16.17).
  await repos.webhooks.recordOutcome(webhook.id, result.outcome, clock());
  logger.info("webhook_delivery_outcome", {
    deliveryId,
    webhookId: webhook.id,
    host: maskWebhookUrl(webhook.url),
    outcome: result.outcome,
    attempts: result.attempts,
    firstAttemptDelayMs,
  });
}

/**
 * Same recipients as alert emails: watchers of the airport, or every user with a watchlist for a
 * nationwide Event. Mirrors the selection in notify(), which stays unchanged.
 */
async function selectRecipients(
  repos: WebhookRepositories,
  events: readonly WebhookEvent[],
  logger: Logger,
): Promise<Map<WebhookEvent, Recipient[]>> {
  const out = new Map<WebhookEvent, Recipient[]>();
  let nationwide: Recipient[] | null = null;
  for (const event of events) {
    if (!ALERT_TYPES.has(event.type)) continue;
    try {
      if (event.type === "NATIONWIDE_EVENT") {
        nationwide ??= await repos.subscriptions.usersWithWatchlist();
        out.set(event, nationwide);
      } else if (event.airportId !== null) {
        out.set(event, await repos.subscriptions.watchersOfAirport(event.airportId));
      }
    } catch (err) {
      logger.error("webhook_recipient_selection_failed", { eventKey: event.eventKey, error: err });
    }
  }
  return out;
}

async function runPool<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next++] as T;
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
}

function defaultRepositories(databaseUrl: string): WebhookRepositories {
  return createRepositories(createDb(databaseUrl));
}
