import { and, eq } from "drizzle-orm";
import { subscriptions, users } from "../schema";
import type { Db } from "./client";

/** Thrown when the `enforce_subscription_cap` trigger rejects a 31st airport (Requirement 8.8). */
export class SubscriptionLimitError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("subscription limit of 30 reached", options);
    this.name = "SubscriptionLimitError";
  }
}

/**
 * Matches the trigger's error: SQLSTATE 23514 with message "subscription limit of 30 reached".
 * Drizzle may wrap the driver error, so the `cause` chain is searched too.
 */
export function isSubscriptionLimitError(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    const e = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (
      e.code === "23514" &&
      typeof e.message === "string" &&
      e.message.includes("subscription limit")
    ) {
      return true;
    }
    current = e.cause;
  }
  return false;
}

export function listSubscriptionsQuery(db: Db, userId: string) {
  return db
    .select({ airportId: subscriptions.airportId, addedAt: subscriptions.addedAt })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(subscriptions.airportId);
}

export function insertSubscriptionQuery(db: Db, userId: string, airportId: string, now: Date) {
  return db
    .insert(subscriptions)
    .values({ userId, airportId, addedAt: now })
    .onConflictDoNothing({ target: [subscriptions.userId, subscriptions.airportId] })
    .returning({ airportId: subscriptions.airportId });
}

export function deleteSubscriptionQuery(db: Db, userId: string, airportId: string) {
  return db
    .delete(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.airportId, airportId)));
}

/** Users watching one airport (Requirement 9.1). */
export function watchersOfAirportQuery(db: Db, airportId: string) {
  return db
    .select({ userId: users.id, email: users.email })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .where(eq(subscriptions.airportId, airportId));
}

/** Users with at least one watchlist airport; users with zero airports never appear (Requirement 9.7). */
export function usersWithWatchlistQuery(db: Db) {
  return db
    .selectDistinct({ userId: users.id, email: users.email })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId));
}

export function subscriptionRepository(db: Db) {
  return {
    list(userId: string) {
      return listSubscriptionsQuery(db, userId);
    },
    /**
     * Adds an airport. Returns false when it was already on the Watchlist (idempotent, Requirement 8.6).
     * Throws SubscriptionLimitError when the trigger rejects a 31st airport.
     * The existence check comes first because the BEFORE INSERT trigger also fires for rows that
     * would conflict, which would wrongly report the cap for an already-present airport at 30.
     */
    async add(userId: string, airportId: string, now: Date): Promise<boolean> {
      const existing = await db
        .select({ airportId: subscriptions.airportId })
        .from(subscriptions)
        .where(and(eq(subscriptions.userId, userId), eq(subscriptions.airportId, airportId)))
        .limit(1);
      if (existing.length > 0) return false;
      try {
        const rows = await insertSubscriptionQuery(db, userId, airportId, now);
        return rows.length === 1;
      } catch (err) {
        if (isSubscriptionLimitError(err)) throw new SubscriptionLimitError({ cause: err });
        throw err;
      }
    },
    /** Idempotent: removing an absent airport is not an error (Requirement 8.3). */
    async remove(userId: string, airportId: string): Promise<void> {
      await deleteSubscriptionQuery(db, userId, airportId);
    },
    watchersOfAirport(airportId: string) {
      return watchersOfAirportQuery(db, airportId);
    },
    usersWithWatchlist() {
      return usersWithWatchlistQuery(db);
    },
  };
}
