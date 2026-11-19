import { WEBHOOK_FAILURE_THRESHOLD } from "@aerobrief/core";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./repositories/client";
import { webhookDeliveries, webhooks } from "./schema";

export type WebhookDeliveryOutcome = "delivered" | "failed" | "skipped";

/** Thrown when the `enforce_webhook_cap` trigger rejects a 4th webhook (Requirement 13.2). */
export class WebhookLimitError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("webhook limit of 3 reached", options);
    this.name = "WebhookLimitError";
  }
}

/**
 * Matches the trigger's error: SQLSTATE 23514 with message "webhook limit of 3 reached".
 * Drizzle may wrap the driver error, so the `cause` chain is searched too.
 */
export function isWebhookLimitError(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    const e = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (e.code === "23514" && typeof e.message === "string" && e.message.includes("webhook limit")) {
      return true;
    }
    current = e.cause;
  }
  return false;
}

/** Columns safe for user-facing output. `url` is deliberately absent (Requirement 13.3). */
const listColumns = {
  id: webhooks.id,
  host: webhooks.host,
  createdAt: webhooks.createdAt,
  state: webhooks.state,
  lastOutcome: webhooks.lastOutcome,
  lastOutcomeAt: webhooks.lastOutcomeAt,
  disabledAt: webhooks.disabledAt,
};

/** A User's webhooks, oldest first. Never selects `url`. */
export function listWebhooksQuery(db: Db, userId: string) {
  return db
    .select(listColumns)
    .from(webhooks)
    .where(eq(webhooks.userId, userId))
    .orderBy(webhooks.createdAt, webhooks.id);
}

export function insertWebhookQuery(
  db: Db,
  input: { id?: string; userId: string; url: string; host: string },
  now: Date,
) {
  return db
    .insert(webhooks)
    .values({ ...(input.id === undefined ? {} : { id: input.id }), userId: input.userId, url: input.url, host: input.host, createdAt: now })
    .returning(listColumns);
}

export function deleteWebhookQuery(db: Db, userId: string, webhookId: string) {
  return db
    .delete(webhooks)
    .where(and(eq(webhooks.id, webhookId), eq(webhooks.userId, userId)))
    .returning({ id: webhooks.id });
}

/** Idempotent: sets the counter to 0, state active, and clears the reason and disabled time. */
export function reenableWebhookQuery(db: Db, userId: string, webhookId: string) {
  return db
    .update(webhooks)
    .set({ state: "active", consecutiveFailures: 0, disabledReason: null, disabledAt: null })
    .where(and(eq(webhooks.id, webhookId), eq(webhooks.userId, userId)))
    .returning(listColumns);
}

/** Sender-facing: the only queries that select `url`. Active webhooks of the given Users. */
export function listActiveWebhooksForSenderQuery(db: Db, userIds: readonly string[]) {
  return db
    .select({ id: webhooks.id, userId: webhooks.userId, url: webhooks.url, host: webhooks.host })
    .from(webhooks)
    .where(and(inArray(webhooks.userId, [...userIds]), eq(webhooks.state, "active")));
}

/** Sender-facing: one webhook of one User for the test event. Disabled webhooks are included (Req 18.8). */
export function getWebhookForSendQuery(db: Db, userId: string, webhookId: string) {
  return db
    .select({
      id: webhooks.id,
      url: webhooks.url,
      host: webhooks.host,
      state: webhooks.state,
      lastTestAt: webhooks.lastTestAt,
    })
    .from(webhooks)
    .where(and(eq(webhooks.id, webhookId), eq(webhooks.userId, userId)))
    .limit(1);
}

/** Claims one delivery per (webhook, event_key, event_type). No returned row means already claimed. */
export function claimDeliveryQuery(
  db: Db,
  input: { id: string; webhookId: string; eventKey: string; eventType: string },
  now: Date,
) {
  return db
    .insert(webhookDeliveries)
    .values({ ...input, createdAt: now })
    .onConflictDoNothing({
      target: [webhookDeliveries.webhookId, webhookDeliveries.eventKey, webhookDeliveries.eventType],
    })
    .returning({ id: webhookDeliveries.id });
}

/** Writes the final result of one delivery. */
export function completeDeliveryQuery(
  db: Db,
  deliveryId: string,
  result: {
    outcome: WebhookDeliveryOutcome;
    attempts: number;
    lastStatus?: number | null;
    lastErrorKind?: string | null;
  },
  now: Date,
) {
  return db
    .update(webhookDeliveries)
    .set({
      outcome: result.outcome,
      attempts: result.attempts,
      lastStatus: result.lastStatus ?? null,
      lastErrorKind: result.lastErrorKind ?? null,
      completedAt: now,
    })
    .where(eq(webhookDeliveries.id, deliveryId));
}

/**
 * One atomic UPDATE per outcome; mirrors `applyOutcome` in @aerobrief/core. All CASE branches read the
 * pre-update row, so concurrent deliveries cannot lose an increment.
 *  - disabled: counter, state and disabled_at stay as they are.
 *  - delivered: failures 0. failed: failures + 1, disabled at the threshold. skipped: unchanged.
 * `last_outcome` and `last_outcome_at` always record the latest result.
 */
export function recordWebhookOutcomeQuery(
  db: Db,
  webhookId: string,
  outcome: WebhookDeliveryOutcome,
  now: Date,
) {
  const isDisabled = sql`${webhooks.state} = 'disabled'`;
  const failedNow = sql`${outcome}::text = 'failed'`;
  const reachesThreshold = sql`${webhooks.consecutiveFailures} + 1 >= ${WEBHOOK_FAILURE_THRESHOLD}`;
  const tripsNow = sql`(NOT ${isDisabled} AND ${failedNow} AND ${reachesThreshold})`;
  return db
    .update(webhooks)
    .set({
      consecutiveFailures: sql`CASE
        WHEN ${isDisabled} THEN ${webhooks.consecutiveFailures}
        WHEN ${outcome}::text = 'delivered' THEN 0
        WHEN ${failedNow} THEN ${webhooks.consecutiveFailures} + 1
        ELSE ${webhooks.consecutiveFailures} END`,
      state: sql`CASE WHEN ${tripsNow} THEN 'disabled' ELSE ${webhooks.state} END`,
      disabledAt: sql`CASE WHEN ${tripsNow} THEN ${now.toISOString()}::timestamptz ELSE ${webhooks.disabledAt} END`,
      disabledReason: sql`CASE WHEN ${tripsNow} THEN 'consecutive_failures' ELSE ${webhooks.disabledReason} END`,
      lastOutcome: outcome,
      lastOutcomeAt: now,
    })
    .where(eq(webhooks.id, webhookId))
    .returning({ id: webhooks.id, state: webhooks.state, consecutiveFailures: webhooks.consecutiveFailures });
}

/** Minimum gap between test events for one webhook (Requirement 18.6). */
export const WEBHOOK_TEST_INTERVAL_SECONDS = 60;

/** Atomically claims the test slot. No returned row means the rate limit applies (or no such webhook). */
export function claimTestSlotQuery(db: Db, userId: string, webhookId: string, now: Date) {
  const cutoff = new Date(now.getTime() - WEBHOOK_TEST_INTERVAL_SECONDS * 1000);
  return db
    .update(webhooks)
    .set({ lastTestAt: now })
    .where(
      and(
        eq(webhooks.id, webhookId),
        eq(webhooks.userId, userId),
        sql`(${webhooks.lastTestAt} IS NULL OR ${webhooks.lastTestAt} <= ${cutoff.toISOString()}::timestamptz)`,
      ),
    )
    .returning({ id: webhooks.id });
}

/** Stores the test result and nothing else (Requirement 18.7). */
export function recordTestOutcomeQuery(
  db: Db,
  userId: string,
  webhookId: string,
  outcome: "delivered" | "failed",
) {
  return db
    .update(webhooks)
    .set({ lastTestOutcome: outcome })
    .where(and(eq(webhooks.id, webhookId), eq(webhooks.userId, userId)));
}

export function webhookRepository(db: Db) {
  return {
    /** List items for a User. Never includes `url`. */
    list(userId: string) {
      return listWebhooksQuery(db, userId);
    },
    /** Inserts a webhook. Throws WebhookLimitError when the cap trigger rejects a 4th one. */
    async insert(input: { id?: string; userId: string; url: string; host: string }, now: Date) {
      try {
        const rows = await insertWebhookQuery(db, input, now);
        return rows[0];
      } catch (err) {
        if (isWebhookLimitError(err)) throw new WebhookLimitError({ cause: err });
        throw err;
      }
    },
    /** Returns false when the webhook does not exist for this User. */
    async delete(userId: string, webhookId: string): Promise<boolean> {
      const rows = await deleteWebhookQuery(db, userId, webhookId);
      return rows.length === 1;
    },
    /** Idempotent. Returns the list item, or undefined when it does not exist for this User. */
    async reenable(userId: string, webhookId: string) {
      const rows = await reenableWebhookQuery(db, userId, webhookId);
      return rows[0];
    },
    /** Sender-facing: includes `url`. */
    activeForSender(userIds: readonly string[]) {
      if (userIds.length === 0) return Promise.resolve([]);
      return listActiveWebhooksForSenderQuery(db, userIds);
    },
    /** Sender-facing: includes `url`. */
    async getForSend(userId: string, webhookId: string) {
      const rows = await getWebhookForSendQuery(db, userId, webhookId);
      return rows[0];
    },
    /** True when this call claimed the delivery; false when it was already claimed. */
    async claimDelivery(
      input: { id: string; webhookId: string; eventKey: string; eventType: string },
      now: Date,
    ): Promise<boolean> {
      const rows = await claimDeliveryQuery(db, input, now);
      return rows.length === 1;
    },
    async completeDelivery(
      deliveryId: string,
      result: Parameters<typeof completeDeliveryQuery>[2],
      now: Date,
    ): Promise<void> {
      await completeDeliveryQuery(db, deliveryId, result, now);
    },
    /** Applies one outcome to the failure counter in a single UPDATE. */
    async recordOutcome(webhookId: string, outcome: WebhookDeliveryOutcome, now: Date) {
      const rows = await recordWebhookOutcomeQuery(db, webhookId, outcome, now);
      return rows[0];
    },
    /** True when the test slot was claimed; false when rate-limited or not found. */
    async claimTestSlot(userId: string, webhookId: string, now: Date): Promise<boolean> {
      const rows = await claimTestSlotQuery(db, userId, webhookId, now);
      return rows.length === 1;
    },
    async recordTestOutcome(userId: string, webhookId: string, outcome: "delivered" | "failed") {
      await recordTestOutcomeQuery(db, userId, webhookId, outcome);
    },
  };
}
