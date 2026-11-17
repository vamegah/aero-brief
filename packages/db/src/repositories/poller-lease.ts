import { and, eq, lt } from "drizzle-orm";
import { pollerLease } from "../schema";
import type { Db } from "./client";

const LEASE_ID = 1;

/**
 * Requirement 1.7. One conditional UPDATE ... WHERE id = 1 AND locked_until < now RETURNING.
 * Postgres row-locks the row, so two concurrent callers cannot both get a row back.
 * The caller's random `token` is stored as the holder.
 */
export function acquireLeaseQuery(db: Db, now: Date, ttlMs: number, token: string) {
  return db
    .update(pollerLease)
    .set({ lockedUntil: new Date(now.getTime() + ttlMs), holder: token })
    .where(and(eq(pollerLease.id, LEASE_ID), lt(pollerLease.lockedUntil, now)))
    .returning({ id: pollerLease.id });
}

/**
 * Marks the lease expired (1 ms before `now`) so the next acquire succeeds.
 * Only the holder can release: a run whose lease expired and was taken by another run matches no row.
 */
export function releaseLeaseQuery(db: Db, token: string, now: Date) {
  return db
    .update(pollerLease)
    .set({ lockedUntil: new Date(now.getTime() - 1), holder: null })
    .where(and(eq(pollerLease.id, LEASE_ID), eq(pollerLease.holder, token)));
}

export function pollerLeaseRepository(db: Db) {
  return {
    /** The holder token when this caller now holds the lease; null when another run holds it. */
    async acquire(now: Date, ttlMs: number): Promise<string | null> {
      const token = crypto.randomUUID();
      const rows = await acquireLeaseQuery(db, now, ttlMs, token);
      return rows.length === 1 ? token : null;
    },
    async release(token: string, now: Date): Promise<void> {
      await releaseLeaseQuery(db, token, now);
    },
  };
}
