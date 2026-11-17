import { createRepositories, subscriptions, SubscriptionLimitError, type Db } from "@aerobrief/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectTestDb, createUser, deleteUserById, hasTestDb, seededAirportIds } from "./test-db";

// Requirement 8.8: the cap trigger keeps a Watchlist at 10 airports even under concurrent adds.
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

  it("the migrated database has enough seeded airports", () => {
    expect(airportIds.length).toBeGreaterThanOrEqual(15);
  });

  it("concurrent adds of 15 distinct airports never exceed 10", async () => {
    const repos = createRepositories(db);
    const user = await createUser(db, "cap-race");
    userIds.push(user.id);
    const now = new Date();

    const results = await Promise.allSettled(
      airportIds.slice(0, 15).map((a) => repos.subscriptions.add(user.id, a, now)),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(await count(user.id)).toBe(10);
    expect(fulfilled).toHaveLength(10);
    expect(rejected).toHaveLength(5);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(SubscriptionLimitError);
  });

  it("sequential: the 11th add is rejected and re-adding an existing airport is idempotent", async () => {
    const repos = createRepositories(db);
    const user = await createUser(db, "cap-seq");
    userIds.push(user.id);
    const now = new Date();

    for (const a of airportIds.slice(0, 10)) expect(await repos.subscriptions.add(user.id, a, now)).toBe(true);
    await expect(repos.subscriptions.add(user.id, airportIds[10] as string, now)).rejects.toBeInstanceOf(
      SubscriptionLimitError,
    );
    expect(await repos.subscriptions.add(user.id, airportIds[0] as string, now)).toBe(false);
    expect(await count(user.id)).toBe(10);
  });
});
