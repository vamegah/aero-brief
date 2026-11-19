import { digestClaimKey, selectDueDigests } from "@aerobrief/core";
import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it } from "vitest";
import { createRepositories } from "../src/repositories";
import * as schema from "../src/schema";
import {
  claimDigestQuery,
  completeDigestQuery,
  digestRepository,
  disableDigestQuery,
  upsertDigestPreferenceQuery,
} from "../src/digest";

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

const now = new Date("2025-01-02T07:30:00.000Z");
const norm = (s: string) => s.replace(/\s+/g, " ").toLowerCase();

describe("digest preferences", () => {
  it("returns the stored row or undefined", async () => {
    const some = fakeDb([[[true, 9]]]);
    expect(await digestRepository(some.db).getPreference("u1")).toEqual({ enabled: true, hour: 9 });
    expect(some.calls[0]?.sql).toContain('"digest_preferences"."user_id" = $1');
    expect(await digestRepository(fakeDb([[]]).db).getPreference("u1")).toBeUndefined();
  });

  it("upsert sets updated_at on insert and on conflict", async () => {
    const { db, calls } = fakeDb([[[true, 7]]]);
    const row = await digestRepository(db).upsertPreference({ userId: "u1", enabled: true, hour: 7 }, now);
    expect(row).toEqual({ enabled: true, hour: 7 });
    const q = calls[0]!;
    expect(q.sql).toContain('on conflict ("user_id") do update set');
    expect(q.sql).toContain('"updated_at" = $');
    expect(q.params.filter((p) => p === now.toISOString()).length).toBe(2);
    expect(norm(upsertDigestPreferenceQuery(db, { userId: "u1", enabled: false, hour: 0 }, now).toSQL().sql)).toContain(
      "returning",
    );
  });

  it("disable sets enabled false and updated_at, is idempotent, and reports whether a row existed", async () => {
    const { db, calls } = fakeDb([[["u1"]], []]);
    const repo = digestRepository(db);
    expect(await repo.disable("u1", now)).toBe(true);
    expect(await repo.disable("u1", now)).toBe(false);
    expect(calls[0]?.sql).toContain('update "digest_preferences" set "enabled" = $1, "updated_at" = $2');
    expect(calls[0]?.params.slice(0, 2)).toEqual([false, now.toISOString()]);
    expect(norm(disableDigestQuery(db, "u1", now).toSQL().sql)).toContain('where "digest_preferences"."user_id" = $3');
  });
});

describe("digest due inputs", () => {
  it("returns no further queries when there are no enabled preferences", async () => {
    const { db, calls } = fakeDb([[]]);
    const out = await digestRepository(db).loadDueInputs(["2025-01-02"]);
    expect(out.prefs).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain('"digest_preferences"."enabled" = $1');
  });

  it("builds prefs, a count Map and a Set of claim keys that feed selectDueDigests", async () => {
    const updated = new Date("2025-01-01T00:00:00.000Z");
    const { db, calls } = fakeDb([
      [
        ["u1", true, 7, updated.toISOString()],
        ["u2", true, 7, updated.toISOString()],
        ["u3", true, 7, updated.toISOString()],
      ],
      [
        ["u1", 2],
        ["u3", 1],
      ],
      [["u3", "2025-01-02"]],
    ]);
    const inputs = await digestRepository(db).loadDueInputs(["2025-01-01", "2025-01-02"]);
    expect(inputs.prefs.map((p) => [p.userId, p.hour, p.updatedAt.getTime()])).toEqual([
      ["u1", 7, updated.getTime()],
      ["u2", 7, updated.getTime()],
      ["u3", 7, updated.getTime()],
    ]);
    expect(inputs.watchlistCounts).toEqual(new Map([["u1", 2], ["u3", 1]]));
    expect(inputs.claimedKeys).toEqual(new Set([digestClaimKey("u3", "2025-01-02")]));
    expect(calls[1]?.sql).toContain('group by "subscriptions"."user_id"');
    expect(calls[2]?.sql).toContain('"digest_deliveries"."digest_date" in ($4, $5)');

    const due = selectDueDigests({ now, ...inputs });
    expect(due.map((d) => d.userId)).toEqual(["u1"]);
    expect(due[0]?.digestDate).toBe("2025-01-02");
  });
});

describe("digest claim and completion", () => {
  it("claims with ON CONFLICT DO NOTHING and reports whether it won", async () => {
    const { db, calls } = fakeDb([[["u1"]], []]);
    const repo = digestRepository(db);
    expect(await repo.claim("u1", "2025-01-02", now)).toBe(true);
    expect(await repo.claim("u1", "2025-01-02", now)).toBe(false);
    expect(calls[0]?.sql).toContain('on conflict ("user_id","digest_date") do nothing returning');
    expect(calls[0]?.sql).toContain("insert into \"digest_deliveries\"");
    expect(norm(claimDigestQuery(db, "u1", "2025-01-02", now).toSQL().sql)).toContain("do nothing");
  });

  it("records status, attempts and completion time on the one claimed row", async () => {
    const { db, calls } = fakeDb([[["u1"]]]);
    await digestRepository(db).complete({ userId: "u1", digestDate: "2025-01-02", status: "handed_off", attempts: 2 }, now);
    const q = calls[0]!;
    expect(q.sql).toContain('update "digest_deliveries" set "status" = $1, "attempts" = $2, "skip_reason" = $3, "completed_at" = $4');
    expect(q.sql).toContain('"user_id" = $5 and "digest_deliveries"."digest_date" = $6');
    expect(q.params).toEqual(["handed_off", 2, null, now.toISOString(), "u1", "2025-01-02"]);
    expect(norm(completeDigestQuery(db, { userId: "u1", digestDate: "d", status: "skipped", attempts: 0, skipReason: "x" }, now).toSQL().params.join())).toContain("x");
  });
});

describe("createRepositories", () => {
  it("exposes digest alongside the existing repositories", () => {
    const repos = createRepositories(fakeDb().db);
    expect(typeof repos.digest.claim).toBe("function");
    expect(typeof repos.webhooks.claimDelivery).toBe("function");
  });
});
