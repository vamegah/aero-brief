import { eq, sql } from "drizzle-orm";
import { users } from "../schema";
import type { Db } from "./client";

export type User = typeof users.$inferSelect;

/** Case-insensitive lookup; matches the `lower(email)` unique index. Callers pass a normalized address. */
export function findUserByEmailQuery(db: Db, email: string) {
  return db
    .select()
    .from(users)
    .where(eq(sql`lower(${users.email})`, email.toLowerCase()))
    .limit(1);
}

/** Insert that ignores a conflict on the `lower(email)` unique index (Requirement 7.3). */
export function insertUserQuery(db: Db, email: string, now: Date) {
  return db
    .insert(users)
    .values({ email, createdAt: now })
    .onConflictDoNothing()
    .returning();
}

/**
 * Requirement 8.10 / design "Account deletion": one `DELETE FROM users WHERE id = $1`.
 * Subscriptions, Sessions and alert_log rows cascade, so it is all-or-nothing.
 */
export function deleteUserQuery(db: Db, userId: string) {
  return db.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
}

export function userRepository(db: Db) {
  return {
    async findByEmail(email: string): Promise<User | null> {
      const [row] = await findUserByEmailQuery(db, email);
      return row ?? null;
    },
    /** Returns the existing user, or creates one. Safe under concurrent calls for the same email. */
    async upsertByEmail(email: string, now: Date): Promise<User> {
      const [inserted] = await insertUserQuery(db, email, now);
      if (inserted !== undefined) return inserted;
      const [existing] = await findUserByEmailQuery(db, email);
      if (existing === undefined) throw new Error("user upsert found no row after conflict");
      return existing;
    },
    /** True when a user was deleted. */
    async deleteAccount(userId: string): Promise<boolean> {
      const rows = await deleteUserQuery(db, userId);
      return rows.length === 1;
    },
  };
}
