import { createRepositories, magicLinks, type Db } from "@aerobrief/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectTestDb, hasTestDb, uniqueEmail } from "./test-db";

// Requirement 7.3: concurrent redeems of one Magic_Link yield exactly one success.
describe.skipIf(!hasTestDb)("Magic_Link redeem (integration)", () => {
  let db: Db;
  const hashes: string[] = [];

  beforeAll(() => {
    db = connectTestDb();
  });
  afterAll(async () => {
    if (db === undefined) return;
    for (const h of hashes) await db.delete(magicLinks).where(eq(magicLinks.tokenHash, h));
  });

  it("concurrent redeems: exactly one returns the email", async () => {
    const repos = createRepositories(db);
    const now = new Date();
    const email = uniqueEmail("redeem");
    const tokenHash = `it-${crypto.randomUUID()}`;
    hashes.push(tokenHash);
    await repos.magicLinks.create({
      email,
      tokenHash,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 15 * 60_000),
    });

    const results = await Promise.all(Array.from({ length: 6 }, () => repos.magicLinks.redeem(tokenHash, now)));

    expect(results.filter((r) => r !== null)).toEqual([email]);
    expect(await repos.magicLinks.redeem(tokenHash, now)).toBeNull();
  });
});
