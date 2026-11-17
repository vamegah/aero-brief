import { RETENTION_MS, SnapshotSchema, type Snapshot } from "@aerobrief/core";
import { desc, gte } from "drizzle-orm";
import { snapshots } from "../schema";
import type { Db } from "./client";

export const retentionCutoff = (now: Date): Date => new Date(now.getTime() - RETENTION_MS);

/** Latest Snapshot within the 24 h window (Requirement 11.3). */
export function latestSnapshotQuery(db: Db, now: Date) {
  return db
    .select()
    .from(snapshots)
    .where(gte(snapshots.capturedAt, retentionCutoff(now)))
    .orderBy(desc(snapshots.capturedAt))
    .limit(1);
}

export function insertSnapshotQuery(db: Db, snapshot: Snapshot) {
  return db.insert(snapshots).values({
    id: snapshot.id,
    capturedAt: new Date(snapshot.capturedAt),
    airports: snapshot.airports,
  });
}

export function snapshotRepository(db: Db) {
  return {
    /** Returns null when there is no Snapshot in the last 24 h. Throws if a stored row is malformed. */
    async latestSnapshot(now: Date): Promise<Snapshot | null> {
      const [row] = await latestSnapshotQuery(db, now);
      if (row === undefined) return null;
      return SnapshotSchema.parse({
        id: row.id,
        capturedAt: row.capturedAt.toISOString(),
        airports: row.airports,
      });
    },
    async insert(snapshot: Snapshot): Promise<void> {
      await insertSnapshotQuery(db, snapshot);
    },
  };
}
