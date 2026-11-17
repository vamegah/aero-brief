import { and, desc, eq, gte } from "drizzle-orm";
import { events } from "../schema";
import type { Db } from "./client";
import { retentionCutoff } from "./snapshots";

export type NewEvent = typeof events.$inferInsert;
export type StoredEvent = typeof events.$inferSelect;

/**
 * Requirement 9.10 / design "FAA_Event_ID and Alert Deduplication":
 * `INSERT ... ON CONFLICT (event_key, type) DO NOTHING RETURNING`.
 * Only rows actually inserted come back. Callers must pass a non-empty list.
 */
export function insertEventsQuery(db: Db, rows: readonly [NewEvent, ...NewEvent[]]) {
  return db
    .insert(events)
    .values([...rows])
    .onConflictDoNothing({ target: [events.eventKey, events.type] })
    .returning();
}

/** Events in the last 24 h, newest first, optionally for one airport (Requirement 11.3). */
export function recentEventsQuery(db: Db, now: Date, airportId?: string) {
  const inWindow = gte(events.occurredAt, retentionCutoff(now));
  return db
    .select()
    .from(events)
    .where(airportId === undefined ? inWindow : and(inWindow, eq(events.airportId, airportId)))
    .orderBy(desc(events.occurredAt));
}

export function eventRepository(db: Db) {
  return {
    /** Returns only the Events that were newly inserted. */
    async insertEvents(rows: readonly NewEvent[]): Promise<StoredEvent[]> {
      const [first, ...rest] = rows;
      if (first === undefined) return [];
      return insertEventsQuery(db, [first, ...rest]);
    },
    recentEvents(now: Date, airportId?: string): Promise<StoredEvent[]> {
      return recentEventsQuery(db, now, airportId);
    },
  };
}
