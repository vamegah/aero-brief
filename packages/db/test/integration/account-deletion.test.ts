import {
  alertLog,
  createRepositories,
  deleteUserQuery,
  sessions,
  subscriptions,
  users,
  type Db,
} from "@aerobrief/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectTestDb, createUser, deleteUserById, hasTestDb, seededAirportIds } from "./test-db";

// Requirement 8.10: account deletion removes the user and everything that belongs to them, or nothing.
describe.skipIf(!hasTestDb)("account deletion (integration)", () => {
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

  async function userWithData(label: string) {
    const repos = createRepositories(db);
    const user = await createUser(db, label);
    userIds.push(user.id);
    const now = new Date();
    await repos.subscriptions.add(user.id, airportIds[0] as string, now);
    await repos.subscriptions.add(user.id, airportIds[1] as string, now);
    await repos.sessions.create({
      userId: user.id,
      tokenHash: `it-${crypto.randomUUID()}`,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 3_600_000),
    });
    await repos.alertLog.claim(
      [
        {
          eventId: crypto.randomUUID(),
          eventKey: `it-${crypto.randomUUID()}`,
          eventType: "GROUND_STOP_STARTED",
          userId: user.id,
          snapshotStoredAt: now,
        },
      ],
      now,
    );
    return user;
  }

  const counts = async (userId: string) => ({
    users: (await db.select().from(users).where(eq(users.id, userId))).length,
    subscriptions: (await db.select().from(subscriptions).where(eq(subscriptions.userId, userId))).length,
    sessions: (await db.select().from(sessions).where(eq(sessions.userId, userId))).length,
    alertLog: (await db.select().from(alertLog).where(eq(alertLog.userId, userId))).length,
  });

  it("deleting a user cascades to subscriptions, sessions and alert_log", async () => {
    const user = await userWithData("delete-cascade");
    expect(await counts(user.id)).toEqual({ users: 1, subscriptions: 2, sessions: 1, alertLog: 1 });

    expect(await createRepositories(db).users.deleteAccount(user.id)).toBe(true);

    expect(await counts(user.id)).toEqual({ users: 0, subscriptions: 0, sessions: 0, alertLog: 0 });
  });

  it("a batch that fails after the delete rolls everything back", async () => {
    const user = await userWithData("delete-rollback");

    // The FK violation on the second statement aborts the batch, including the user delete.
    const failing = db
      .insert(subscriptions)
      .values({ userId: crypto.randomUUID(), airportId: "NOPE" });
    await expect(db.batch([deleteUserQuery(db, user.id), failing])).rejects.toThrow();

    expect(await counts(user.id)).toEqual({ users: 1, subscriptions: 2, sessions: 1, alertLog: 1 });
  });
});
