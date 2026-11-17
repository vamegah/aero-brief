import { lt } from "drizzle-orm";
import { alertLog, events, jobRuns, magicLinks, sessions, snapshots } from "../schema";
import type { Db } from "./client";
import { retentionCutoff } from "./snapshots";

/** alert_log is kept 48 h so latency records outlive the Events they refer to (design: apps/poller). */
export const ALERT_LOG_RETENTION_MS = 172_800_000;

/** The six DELETE statements of one cleanup run, in execution order. */
export function cleanupStatements(db: Db, now: Date) {
  const cutoff = retentionCutoff(now);
  const alertCutoff = new Date(now.getTime() - ALERT_LOG_RETENTION_MS);
  return [
    db.delete(snapshots).where(lt(snapshots.capturedAt, cutoff)),
    db.delete(events).where(lt(events.occurredAt, cutoff)),
    db.delete(jobRuns).where(lt(jobRuns.startedAt, cutoff)),
    db.delete(alertLog).where(lt(alertLog.createdAt, alertCutoff)),
    db.delete(sessions).where(lt(sessions.expiresAt, now)),
    db.delete(magicLinks).where(lt(magicLinks.expiresAt, now)),
  ] as const;
}

export function cleanupRepository(db: Db) {
  return {
    /** One db.batch, so a failed run changes nothing (Requirement 11.6). */
    async cleanup(now: Date): Promise<void> {
      await db.batch(cleanupStatements(db, now));
    },
  };
}
