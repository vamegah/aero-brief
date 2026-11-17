import { eq } from "drizzle-orm";
import { alertLog } from "../schema";
import type { Db } from "./client";

export type NewAlertClaim = {
  eventId: string;
  eventKey: string;
  eventType: string;
  userId: string;
  /** Right after the Snapshot batch commits; the start of Alert_Latency (Requirement 12.4). */
  snapshotStoredAt: Date;
};

export type ClaimedAlert = typeof alertLog.$inferSelect;

export type AlertOutcome = {
  status: "handed_off" | "failed";
  attempts: number;
  completedAt: Date;
  /** acceptedAt - storedAt. Omit to record the outcome first and the latency separately. */
  latencyMs?: number;
  error?: string;
};

/**
 * Requirements 9.4, 9.10 / design "Notifier" step 3: one bulk
 * `INSERT ... ON CONFLICT (event_key, event_type, user_id) DO NOTHING RETURNING`.
 * Only rows that come back are new and may be sent. Callers pass a non-empty list.
 */
export function claimAlertsQuery(db: Db, rows: readonly [NewAlertClaim, ...NewAlertClaim[]], now: Date) {
  return db
    .insert(alertLog)
    .values(rows.map((r) => ({ ...r, status: "pending", attempts: 0, createdAt: now })))
    .onConflictDoNothing({ target: [alertLog.eventKey, alertLog.eventType, alertLog.userId] })
    .returning();
}

export function recordOutcomeQuery(db: Db, id: string, outcome: AlertOutcome) {
  return db
    .update(alertLog)
    .set({
      status: outcome.status,
      attempts: outcome.attempts,
      completedAt: outcome.completedAt,
      error: outcome.error ?? null,
      ...(outcome.latencyMs === undefined ? {} : { latencyMs: outcome.latencyMs }),
    })
    .where(eq(alertLog.id, id));
}

/** Separate write so a latency failure cannot lose the email outcome (Requirement 12.7). */
export function recordLatencyQuery(db: Db, id: string, latencyMs: number) {
  return db.update(alertLog).set({ latencyMs }).where(eq(alertLog.id, id));
}

export function alertLogRepository(db: Db) {
  return {
    /** Returns only the newly claimed rows. */
    async claim(rows: readonly NewAlertClaim[], now: Date): Promise<ClaimedAlert[]> {
      const [first, ...rest] = rows;
      if (first === undefined) return [];
      return claimAlertsQuery(db, [first, ...rest], now);
    },
    async recordOutcome(id: string, outcome: AlertOutcome): Promise<void> {
      await recordOutcomeQuery(db, id, outcome);
    },
    async recordLatency(id: string, latencyMs: number): Promise<void> {
      await recordLatencyQuery(db, id, latencyMs);
    },
  };
}
