import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it } from "vitest";
import * as schema from "../src/schema";
import { createRepositories } from "../src/repositories";
import {
  claimDeliveryQuery,
  claimTestSlotQuery,
  isWebhookLimitError,
  listActiveWebhooksForSenderQuery,
  listWebhooksQuery,
  recordWebhookOutcomeQuery,
  reenableWebhookQuery,
  webhookRepository,
  WebhookLimitError,
} from "../src/webhooks";

type Call = { sql: string; params: unknown[] };

/** Fake neon-http client: records each statement and answers with queued rows (array mode). */
function fakeDb(responses: Array<unknown[][] | Error> = []) {
  const calls: Call[] = [];
  const client = async (sql: string, params: unknown[]) => {
    calls.push({ sql: sql.replace(/\s+/g, " ").toLowerCase(), params });
    const next = responses.shift() ?? [];
    if (next instanceof Error) throw next;
    return { rows: next, rowCount: next.length, fields: [] };
  };
  const db = drizzle({ client: client as never, schema });
  return { db, calls };
}

const now = new Date("2025-01-02T12:00:00.000Z");
const norm = (s: string) => s.replace(/\s+/g, " ").toLowerCase();

describe("webhook list", () => {
  it("scopes by user and never selects url", () => {
    const { db } = fakeDb();
    const q = norm(listWebhooksQuery(db, "u1").toSQL().sql);
    expect(q).toContain('"webhooks"."user_id" = $1');
    expect(q).not.toMatch(/"url"/);
  });

  it("only the sender-facing query selects url", () => {
    const { db } = fakeDb();
    expect(norm(listActiveWebhooksForSenderQuery(db, ["u1"]).toSQL().sql)).toContain('"url"');
    expect(norm(listActiveWebhooksForSenderQuery(db, ["u1"]).toSQL().sql)).toContain('"webhooks"."state" = $');
  });
});

describe("webhook insert", () => {
  it("returns the list item and maps SQLSTATE 23514 cap error to WebhookLimitError", async () => {
    const ok = fakeDb([[["id1", "example.com", now.toISOString(), "active", null, null, null]]]);
    const row = await webhookRepository(ok.db).insert({ userId: "u1", url: "https://example.com/h", host: "example.com" }, now);
    expect(row?.host).toBe("example.com");
    expect(ok.calls[0]?.sql).toContain('returning "id", "host"');
    expect(ok.calls[0]?.sql).not.toMatch(/returning[^)]*"url"/);

    const capErr = Object.assign(new Error("webhook limit of 3 reached"), { code: "23514" });
    const capped = fakeDb([capErr]);
    await expect(
      webhookRepository(capped.db).insert({ userId: "u1", url: "https://example.com/h", host: "example.com" }, now),
    ).rejects.toBeInstanceOf(WebhookLimitError);

    const other = fakeDb([Object.assign(new Error("boom"), { code: "23514" })]);
    await expect(
      webhookRepository(other.db).insert({ userId: "u1", url: "https://example.com/h", host: "example.com" }, now),
    ).rejects.not.toBeInstanceOf(WebhookLimitError);
  });

  it("finds the cap error through a cause chain", () => {
    const inner = Object.assign(new Error("webhook limit of 3 reached"), { code: "23514" });
    expect(isWebhookLimitError(new Error("wrapped", { cause: inner }))).toBe(true);
    expect(isWebhookLimitError(new Error("subscription limit of 10 reached"))).toBe(false);
  });
});

describe("webhook delete and re-enable", () => {
  it("delete is scoped by id and user; reports whether a row was removed", async () => {
    const hit = fakeDb([[["id1"]]]);
    expect(await webhookRepository(hit.db).delete("u1", "id1")).toBe(true);
    expect(hit.calls[0]?.sql).toContain('"webhooks"."id" = $1');
    expect(hit.calls[0]?.sql).toContain('"webhooks"."user_id" = $2');
    const miss = fakeDb([[]]);
    expect(await webhookRepository(miss.db).delete("u2", "id1")).toBe(false);
  });

  it("re-enable resets counter, state and reason in one user-scoped UPDATE", () => {
    const { db } = fakeDb();
    const q = reenableWebhookQuery(db, "u1", "id1").toSQL();
    const s = norm(q.sql);
    expect(s).toContain('"state" = $1');
    expect(s).toContain('"consecutive_failures" = $2');
    expect(s).toContain('"disabled_reason" = $3');
    expect(s).toContain('"disabled_at" = $4');
    expect(q.params.slice(0, 4)).toEqual(["active", 0, null, null]);
    expect(s).toContain('"user_id" = $');
  });
});

describe("delivery claim", () => {
  it("uses ON CONFLICT DO NOTHING RETURNING on the unique triple", async () => {
    const { db } = fakeDb();
    const s = norm(
      claimDeliveryQuery(db, { id: "d1", webhookId: "w1", eventKey: "k", eventType: "ground_stop.started" }, now).toSQL().sql,
    );
    expect(s).toContain('on conflict ("webhook_id","event_key","event_type") do nothing returning "id"');
  });

  it("reports true when claimed and false when already claimed", async () => {
    const input = { id: "d1", webhookId: "w1", eventKey: "k", eventType: "t" };
    expect(await webhookRepository(fakeDb([[["d1"]]]).db).claimDelivery(input, now)).toBe(true);
    expect(await webhookRepository(fakeDb([[]]).db).claimDelivery(input, now)).toBe(false);
  });
});

describe("record outcome", () => {
  it("is one UPDATE with CASE for counter and state, threshold 5", async () => {
    const { db, calls } = fakeDb([[["w1", "active", 1]]]);
    const q = recordWebhookOutcomeQuery(db, "w1", "failed", now).toSQL();
    const s = norm(q.sql);
    expect(s.startsWith('update "webhooks" set')).toBe(true);
    expect((s.match(/case/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(s).toContain('"consecutive_failures" = case');
    expect(s).toContain('"state" = case');
    expect(s).toContain('"last_outcome" = $');
    expect(q.params).toContain(5);
    expect(q.params).toContain("failed");

    const res = await webhookRepository(db).recordOutcome("w1", "failed", now);
    expect(calls).toHaveLength(1);
    expect(res).toEqual({ id: "w1", state: "active", consecutiveFailures: 1 });
  });

  it("does not touch counter columns for a disabled webhook (guarded by state = 'disabled')", () => {
    const { db } = fakeDb();
    const s = norm(recordWebhookOutcomeQuery(db, "w1", "delivered", now).toSQL().sql);
    expect(s).toContain("when \"webhooks\".\"state\" = 'disabled' then \"webhooks\".\"consecutive_failures\"");
  });
});

describe("test slot", () => {
  it("claims with a 60 second cutoff, scoped by user", async () => {
    const { db } = fakeDb();
    const q = claimTestSlotQuery(db, "u1", "w1", now).toSQL();
    const s = norm(q.sql);
    expect(s).toContain('"last_test_at" is null or "webhooks"."last_test_at" <=');
    expect(s).toContain('"webhooks"."user_id" = $');
    expect(s).toContain('returning "id"');
    expect(q.params).toContain("2025-01-02T11:59:00.000Z");
  });

  it("returns false when the limit applies", async () => {
    expect(await webhookRepository(fakeDb([[]]).db).claimTestSlot("u1", "w1", now)).toBe(false);
    expect(await webhookRepository(fakeDb([[["w1"]]]).db).claimTestSlot("u1", "w1", now)).toBe(true);
  });
});

describe("createRepositories", () => {
  it("exposes the webhook repository", () => {
    const { db } = fakeDb();
    expect(typeof createRepositories(db).webhooks.claimTestSlot).toBe("function");
  });
});
