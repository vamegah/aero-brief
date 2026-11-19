import { digestClaimKey, type DigestPrefRow } from "@aerobrief/core";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./repositories/client";
import { digestDeliveries, digestPreferences, subscriptions } from "./schema";

export type DigestFinalStatus = "handed_off" | "failed" | "skipped";

/** A User's stored preference, or undefined when no row exists (the API defaults it). */
export function getDigestPreferenceQuery(db: Db, userId: string) {
  return db
    .select({ enabled: digestPreferences.enabled, hour: digestPreferences.hour })
    .from(digestPreferences)
    .where(eq(digestPreferences.userId, userId))
    .limit(1);
}

/** Insert or update a preference. `updated_at` is always set to `now`. The API validates the hour. */
export function upsertDigestPreferenceQuery(
  db: Db,
  input: { userId: string; enabled: boolean; hour: number },
  now: Date,
) {
  return db
    .insert(digestPreferences)
    .values({ userId: input.userId, enabled: input.enabled, hour: input.hour, updatedAt: now })
    .onConflictDoUpdate({
      target: digestPreferences.userId,
      set: { enabled: input.enabled, hour: input.hour, updatedAt: now },
    })
    .returning({ enabled: digestPreferences.enabled, hour: digestPreferences.hour });
}

/** Idempotent. Only touches an existing row; a User without a row is already disabled. */
export function disableDigestQuery(db: Db, userId: string, now: Date) {
  return db
    .update(digestPreferences)
    .set({ enabled: false, updatedAt: now })
    .where(eq(digestPreferences.userId, userId))
    .returning({ userId: digestPreferences.userId });
}

export function listEnabledDigestPreferencesQuery(db: Db) {
  return db
    .select({
      userId: digestPreferences.userId,
      enabled: digestPreferences.enabled,
      hour: digestPreferences.hour,
      updatedAt: digestPreferences.updatedAt,
    })
    .from(digestPreferences)
    .where(eq(digestPreferences.enabled, true));
}

export function watchlistCountsQuery(db: Db, userIds: readonly string[]) {
  return db
    .select({ userId: subscriptions.userId, count: sql<number>`count(*)::int` })
    .from(subscriptions)
    .where(inArray(subscriptions.userId, [...userIds]))
    .groupBy(subscriptions.userId);
}

export function claimedDigestKeysQuery(db: Db, userIds: readonly string[], digestDates: readonly string[]) {
  return db
    .select({ userId: digestDeliveries.userId, digestDate: digestDeliveries.digestDate })
    .from(digestDeliveries)
    .where(and(inArray(digestDeliveries.userId, [...userIds]), inArray(digestDeliveries.digestDate, [...digestDates])));
}

/** One claim per (user, digest date). No returned row means another run owns it. */
export function claimDigestQuery(db: Db, userId: string, digestDate: string, now: Date) {
  return db
    .insert(digestDeliveries)
    .values({ userId, digestDate, status: "claimed", claimedAt: now })
    .onConflictDoNothing({ target: [digestDeliveries.userId, digestDeliveries.digestDate] })
    .returning({ userId: digestDeliveries.userId });
}

/** Writes the final result on the claimed row only. */
export function completeDigestQuery(
  db: Db,
  input: { userId: string; digestDate: string; status: DigestFinalStatus; attempts: number; skipReason?: string | null },
  now: Date,
) {
  return db
    .update(digestDeliveries)
    .set({
      status: input.status,
      attempts: input.attempts,
      skipReason: input.skipReason ?? null,
      completedAt: now,
    })
    .where(and(eq(digestDeliveries.userId, input.userId), eq(digestDeliveries.digestDate, input.digestDate)))
    .returning({ userId: digestDeliveries.userId });
}

export type DigestDueInputs = {
  prefs: DigestPrefRow[];
  /** Counts for the enabled Users; absent means zero. */
  watchlistCounts: Map<string, number>;
  /** `digestClaimKey` values for the candidate dates. */
  claimedKeys: Set<string>;
};

export function digestRepository(db: Db) {
  return {
    async getPreference(userId: string): Promise<{ enabled: boolean; hour: number } | undefined> {
      const rows = await getDigestPreferenceQuery(db, userId);
      return rows[0];
    },
    async upsertPreference(input: { userId: string; enabled: boolean; hour: number }, now: Date) {
      const rows = await upsertDigestPreferenceQuery(db, input, now);
      return rows[0];
    },
    /** Returns true when a row existed. */
    async disable(userId: string, now: Date): Promise<boolean> {
      const rows = await disableDigestQuery(db, userId, now);
      return rows.length === 1;
    },
    /** Inputs for `selectDueDigests`: enabled preferences, Watchlist counts and claimed keys. */
    async loadDueInputs(candidateDates: readonly string[]): Promise<DigestDueInputs> {
      const prefs: DigestPrefRow[] = (await listEnabledDigestPreferencesQuery(db)).map((r) => ({
        userId: r.userId,
        enabled: r.enabled,
        hour: Number(r.hour),
        updatedAt: r.updatedAt,
      }));
      const watchlistCounts = new Map<string, number>();
      const claimedKeys = new Set<string>();
      if (prefs.length === 0) return { prefs, watchlistCounts, claimedKeys };
      const userIds = prefs.map((p) => p.userId);
      for (const row of await watchlistCountsQuery(db, userIds)) {
        watchlistCounts.set(row.userId, Number(row.count));
      }
      if (candidateDates.length > 0) {
        for (const row of await claimedDigestKeysQuery(db, userIds, candidateDates)) {
          claimedKeys.add(digestClaimKey(row.userId, row.digestDate));
        }
      }
      return { prefs, watchlistCounts, claimedKeys };
    },
    /** True when this call claimed the delivery; false when it was already claimed. */
    async claim(userId: string, digestDate: string, now: Date): Promise<boolean> {
      const rows = await claimDigestQuery(db, userId, digestDate, now);
      return rows.length === 1;
    },
    async complete(input: Parameters<typeof completeDigestQuery>[1], now: Date): Promise<void> {
      await completeDigestQuery(db, input, now);
    },
  };
}
