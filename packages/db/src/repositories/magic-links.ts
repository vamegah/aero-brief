import { and, eq, gt, gte, isNull, sql } from "drizzle-orm";
import { magicLinks } from "../schema";
import type { Db } from "./client";

const RATE_WINDOW_MS = 60 * 60 * 1000;

export type NewMagicLink = {
  email: string;
  /** SHA-256 of the emailed token. The raw token is never stored. */
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
};

export function insertMagicLinkQuery(db: Db, input: NewMagicLink) {
  return db.insert(magicLinks).values(input).returning({ id: magicLinks.id });
}

/**
 * Requirement 7.3 / design "Authentication": one atomic statement.
 * `UPDATE magic_links SET used_at = now WHERE token_hash = $1 AND used_at IS NULL
 *  AND invalidated_at IS NULL AND expires_at > now RETURNING email`.
 * Two concurrent redeems cannot both get a row back.
 */
export function redeemMagicLinkQuery(db: Db, tokenHash: string, now: Date) {
  return db
    .update(magicLinks)
    .set({ usedAt: now })
    .where(
      and(
        eq(magicLinks.tokenHash, tokenHash),
        isNull(magicLinks.usedAt),
        isNull(magicLinks.invalidatedAt),
        gt(magicLinks.expiresAt, now),
      ),
    )
    .returning({ email: magicLinks.email });
}

/** Requirement 7.10: a link whose email Resend did not accept can no longer be redeemed. */
export function invalidateMagicLinkQuery(db: Db, tokenHash: string, now: Date) {
  return db
    .update(magicLinks)
    .set({ invalidatedAt: now })
    .where(and(eq(magicLinks.tokenHash, tokenHash), isNull(magicLinks.invalidatedAt)));
}

/** Requirement 7.8: rows created in the preceding 60 minutes. Invalidated rows still count. */
export function countRecentMagicLinksQuery(db: Db, email: string, now: Date) {
  return db
    .select({ count: sql<number>`count(*)::int` })
    .from(magicLinks)
    .where(
      and(
        eq(magicLinks.email, email),
        gte(magicLinks.createdAt, new Date(now.getTime() - RATE_WINDOW_MS)),
      ),
    );
}

export function magicLinkRepository(db: Db) {
  return {
    async create(input: NewMagicLink): Promise<void> {
      await insertMagicLinkQuery(db, input);
    },
    /** The link's email when redeemed now; null when invalid, used, invalidated or expired. */
    async redeem(tokenHash: string, now: Date): Promise<string | null> {
      const rows = await redeemMagicLinkQuery(db, tokenHash, now);
      return rows[0]?.email ?? null;
    },
    async invalidate(tokenHash: string, now: Date): Promise<void> {
      await invalidateMagicLinkQuery(db, tokenHash, now);
    },
    async countRecent(email: string, now: Date): Promise<number> {
      const [row] = await countRecentMagicLinksQuery(db, email, now);
      return row?.count ?? 0;
    },
  };
}
