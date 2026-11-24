import { MONITORED_IDS } from "@aerobrief/core";
import { airports, createRepositories, subscriptions, SubscriptionLimitError, type Db } from "@aerobrief/db";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectTestDb, createUser, deleteUserById, hasTestDb, seededAirportIds } from "./test-db";

// Requirement 8.8 of the original spec, now a cap of 30 (core30-limits): the cap trigger keeps a Watchlist at 30 airports even under concurrent adds.
describe.skipIf(!hasTestDb)("watchlist cap trigger (integration)", () => {
  let db: Db;
  let airportIds: string[];
  const userIds: string[] = [];
  // The registry has exactly 30 airports, so the race needs 5 more rows to exceed the cap.
  const tempIds = [1, 2, 3, 4, 5].map((n) => `ZT${n}`);

  beforeAll(async () => {
    db = connectTestDb();
    airportIds = await seededAirportIds(db);
    await db
      .insert(airports)
      .values(tempIds.map((id, i) => ({ id, name: `Test airport ${i + 1}`, artcc: "ZZZ" })))
      .onConflictDoNothing();
  });
  afterAll(async () => {
    if (db === undefined) return;
    // Users first: their subscriptions cascade and would otherwise reference the temporary airports.
    for (const id of userIds) await deleteUserById(db, id);
    await db.delete(airports).where(inArray(airports.id, tempIds));
  });

  const count = async (userId: string) =>
    (await db.select().from(subscriptions).where(eq(subscriptions.userId, userId))).length;

  it("the migrated database has exactly the 30 seeded airports (fails if migration 0006 is missing)", () => {
    expect([...airportIds].sort()).toEqual([...MONITORED_IDS].sort());
    expect(airportIds).toHaveLength(30);
  });

  it("concurrent adds of 35 distinct airports never exceed 30", async () => {
    const repos = createRepositories(db);
    const user = await createUser(db, "cap-race");
    userIds.push(user.id);
    const now = new Date();

    const results = await Promise.allSettled(
      [...airportIds, ...tempIds].map((a) => repos.subscriptions.add(user.id, a, now)),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(await count(user.id)).toBe(30);
    expect(fulfilled).toHaveLength(30);
    expect(rejected).toHaveLength(5);
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(SubscriptionLimitError);
      expect((r.reason as Error).message).toBe("subscription limit of 30 reached");
    }
  });

  it("sequential: the 31st add is rejected and re-adding an existing airport is idempotent", async () => {
    const repos = createRepositories(db);
    const user = await createUser(db, "cap-seq");
    userIds.push(user.id);
    const now = new Date();

    for (const a of airportIds) expect(await repos.subscriptions.add(user.id, a, now)).toBe(true);
    await expect(repos.subscriptions.add(user.id, tempIds[0] as string, now)).rejects.toBeInstanceOf(
      SubscriptionLimitError,
    );
    expect(await repos.subscriptions.add(user.id, airportIds[0] as string, now)).toBe(false);
    expect(await count(user.id)).toBe(30);
  });
});
