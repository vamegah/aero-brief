import { describe, expect, it } from "vitest";
import {
  claimAlertsQuery,
  countRecentMagicLinksQuery,
  createDb,
  deleteUserQuery,
  isSubscriptionLimitError,
  redeemMagicLinkQuery,
  recordOutcomeQuery,
  SubscriptionLimitError,
} from "../src/repositories";

const db = createDb("postgresql://user:pass@db.invalid/aerobrief");
const now = new Date("2025-01-02T12:00:00.000Z");
const norm = (s: string) => s.replace(/\s+/g, " ").toLowerCase();

describe("magic links", () => {
  it("redeem is one atomic UPDATE ... RETURNING email on the hash only", () => {
    const q = redeemMagicLinkQuery(db, "hash-1", now).toSQL();
    const sql = norm(q.sql);
    expect(sql).toContain('update "magic_links" set "used_at" = $1');
    expect(sql).toContain('"magic_links"."token_hash" = $2');
    expect(sql).toContain('"magic_links"."used_at" is null');
    expect(sql).toContain('"magic_links"."invalidated_at" is null');
    expect(sql).toContain('"magic_links"."expires_at" > $3');
    expect(sql).toContain('returning "email"');
  });

  it("rate-limit count looks back 60 minutes", () => {
    const q = countRecentMagicLinksQuery(db, "a@b.co", now).toSQL();
    // Drizzle maps timestamp params to ISO strings in toSQL(); accept Date too.
    const iso = q.params
      .filter((p): p is string | Date => p instanceof Date || (typeof p === "string" && /^\d{4}-\d\d-\d\dT/.test(p)))
      .map((p) => new Date(p).toISOString());
    expect(iso).toEqual(["2025-01-02T11:00:00.000Z"]);
  });
});

describe("account deletion", () => {
  it("is a single DELETE FROM users", () => {
    expect(norm(deleteUserQuery(db, "u1").toSQL().sql)).toMatch(/^delete from "users" where "users"."id" = \$1/);
  });
});

describe("alert_log", () => {
  it("claims in bulk with ON CONFLICT (event_key, event_type, user_id) DO NOTHING RETURNING", () => {
    const row = {
      eventId: "00000000-0000-4000-8000-000000000001",
      eventKey: "faa:1",
      eventType: "GROUND_STOP_STARTED",
      userId: "00000000-0000-4000-8000-000000000002",
      snapshotStoredAt: now,
    };
    const sql = norm(claimAlertsQuery(db, [row, { ...row, userId: "00000000-0000-4000-8000-000000000003" }], now).toSQL().sql);
    expect(sql).toMatch(/on conflict \("event_key",\s*"event_type",\s*"user_id"\) do nothing/);
    expect(sql).toContain("returning");
  });

  it("outcome update includes latency only when given", () => {
    const base = { status: "handed_off", attempts: 1, completedAt: now } as const;
    expect(norm(recordOutcomeQuery(db, "x", base).toSQL().sql)).not.toContain("latency_ms");
    expect(norm(recordOutcomeQuery(db, "x", { ...base, latencyMs: 5 }).toSQL().sql)).toContain("latency_ms");
  });
});

describe("subscription cap error mapping", () => {
  const trigger = { code: "23514", message: "subscription limit of 10 reached" };

  it("recognizes the trigger error, directly and wrapped", () => {
    expect(isSubscriptionLimitError(trigger)).toBe(true);
    expect(isSubscriptionLimitError(new Error("Failed query", { cause: trigger }))).toBe(true);
  });

  it("ignores other errors", () => {
    expect(isSubscriptionLimitError({ code: "23514", message: "other check" })).toBe(false);
    expect(isSubscriptionLimitError({ code: "23505", message: "subscription limit" })).toBe(false);
    expect(isSubscriptionLimitError(null)).toBe(false);
  });

  it("typed error is an Error subclass", () => {
    expect(new SubscriptionLimitError()).toBeInstanceOf(Error);
  });
});
