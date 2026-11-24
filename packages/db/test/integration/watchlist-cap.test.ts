import { airports, createRepositories, subscriptions, SubscriptionLimitError, type Db } from "@aerobrief/db";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectTestDb, createUser, deleteUserById, hasTestDb, seededAirportIds } from "./test-db";

// Requirement 8.8 of the original spec, now a cap of 30 (core30-limits): the cap trigger keeps a Watchlist at 30 airports even under concurrent adds.
describe.skipIf(!hasTestDb)("watchlist cap trigger (integration)", () => {
  let db: Db;
  let airportIds: string[];
  const userIds: string[] = [];

  beforeAll(async () => {
    db = connectTestDb();
    airportIds = await seededAirportIds(db);
  });
  afterAll(async () => {
    if (db === undefined) return;
    for (const id of userIds) await deleteUserById(db, id);
  });

  const count = async (userId: string) =>
    (await db.select().from(subscriptions).where(eq(subscriptions.userId, userId))).length;

  it("the migrated database has at least 35 seeded airports (30 after migration 0006 would be too few for the race test)", () => {
    expect(airportIds.length).toBeGreaterThanOrEqual(35);
  });

  it("concurrent adds of 35 distinct airports never exceed 30", async () => {
    const repos = createRepositories(db);
    const user = await createUser(db, "cap-race");
    userIds.push(user.id);
    const now = new Date();

    const results = await Promise.allSettled(
      airportIds.slice(0, 35).map((a) => repos.subscriptions.add(user.id, a, now)),
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

    for (const a of airportIds.slice(0, 30)) expect(await repos.subscriptions.add(user.id, a, now)).toBe(true);
    await expect(repos.subscriptions.add(user.id, airportIds[30] as string, now)).rejects.toBeInstanceOf(
      SubscriptionLimitError,
    );
    expect(await repos.subscriptions.add(user.id, airportIds[0] as string, now)).toBe(false);
    expect(await count(user.id)).toBe(30);
  });
});
