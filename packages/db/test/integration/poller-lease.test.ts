import { createRepositories, pollerLease, type Db } from "@aerobrief/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { connectTestDb, hasTestDb } from "./test-db";

// Requirement 1.7: two concurrent acquisitions, exactly one wins.
describe.skipIf(!hasTestDb)("poller lease (integration)", () => {
  let db: Db;

  const expireLease = async () => {
    await db
      .insert(pollerLease)
      .values({ id: 1, lockedUntil: new Date(0), holder: null })
      .onConflictDoUpdate({ target: pollerLease.id, set: { lockedUntil: new Date(0), holder: null } });
  };

  beforeAll(() => {
    db = connectTestDb();
  });
  beforeEach(async () => {
    await expireLease();
  });
  afterAll(async () => {
    if (db !== undefined) await expireLease();
  });

  it("two concurrent acquisitions: exactly one wins", async () => {
    const repos = createRepositories(db);
    const now = new Date();
    const results = await Promise.all([repos.pollerLease.acquire(now, 60_000), repos.pollerLease.acquire(now, 60_000)]);
    expect(results.filter((t) => t !== null)).toHaveLength(1);
  });

  it("many concurrent acquisitions: still exactly one winner, and it is the stored holder", async () => {
    const repos = createRepositories(db);
    const now = new Date();
    const results = await Promise.all(Array.from({ length: 8 }, () => repos.pollerLease.acquire(now, 60_000)));
    const winners = results.filter((t): t is string => t !== null);
    expect(winners).toHaveLength(1);
    const [row] = await db.select().from(pollerLease).where(eq(pollerLease.id, 1));
    expect(row?.holder).toBe(winners[0]);
  });

  it("release lets the next acquisition succeed; a non-holder release does nothing", async () => {
    const repos = createRepositories(db);
    const now = new Date();
    const token = await repos.pollerLease.acquire(now, 60_000);
    expect(token).not.toBeNull();
    expect(await repos.pollerLease.acquire(now, 60_000)).toBeNull();

    await repos.pollerLease.release("not-the-holder", now);
    expect(await repos.pollerLease.acquire(now, 60_000)).toBeNull();

    await repos.pollerLease.release(token as string, now);
    expect(await repos.pollerLease.acquire(now, 60_000)).not.toBeNull();
  });
});
