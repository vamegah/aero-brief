import { and, eq, gt } from "drizzle-orm";
import { sessions, users } from "../schema";
import type { Db } from "./client";

export type NewSession = {
  userId: string;
  /** SHA-256 of the cookie token. The raw token is never stored. */
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
};

export function insertSessionQuery(db: Db, input: NewSession) {
  return db.insert(sessions).values(input).returning({ id: sessions.id });
}

/** The user for an unexpired Session; expiry is checked against `now`. */
export function findSessionQuery(db: Db, tokenHash: string, now: Date) {
  return db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      email: users.email,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);
}

export function deleteSessionQuery(db: Db, tokenHash: string) {
  return db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

export function sessionRepository(db: Db) {
  return {
    async create(input: NewSession): Promise<void> {
      await insertSessionQuery(db, input);
    },
    async findValid(tokenHash: string, now: Date) {
      const [row] = await findSessionQuery(db, tokenHash, now);
      return row ?? null;
    },
    async delete(tokenHash: string): Promise<void> {
      await deleteSessionQuery(db, tokenHash);
    },
  };
}
