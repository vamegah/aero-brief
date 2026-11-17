import {
  alertLog,
  cleanupStatements,
  createRepositories,
  events,
  jobRuns,
  magicLinks,
  sessions,
  snapshots,
  type Db,
} from "@aerobrief/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectTestDb, createUser, deleteUserById, hasTestDb, makeSnapshot } from "./test-db";

const HOUR = 3_600_000;

// Requirement 11.6: a failed cleanup run changes nothing; a successful one removes only expired rows.
describe.skipIf(!hasTestDb)("cleanup batch (integration)", () => {
  let db: Db;
  const now = new Date();
  const old = new Date(now.getTime() - 60 * HOUR);
  const tag = crypto.randomUUID();
  const ids = {
    oldSnapshot: crypto.randomUUID(),
    newSnapshot: crypto.randomUUID(),
    userId: "",
    oldEventKey: `it-old-${tag}`,
    newEventKey: `it-new-${tag}`,
    oldJobRun: crypto.randomUUID(),
    oldAlert: `it-alert-${tag}`,
    expiredSession: `it-sess-${tag}`,
    expiredLink: `it-link-${tag}`,
  };

  beforeAll(async () => {
    db = connectTestDb();
    const user = await createUser(db, "cleanup");
    ids.userId = user.id;

    const oldSnap = makeSnapshot(old);
    const newSnap = makeSnapshot(now);
    await db.insert(snapshots).values([
      { id: ids.oldSnapshot, capturedAt: old, airports: oldSnap.airports },
      { id: ids.newSnapshot, capturedAt: now, airports: newSnap.airports },
    ]);
    const base = { snapshotId: ids.newSnapshot, type: "GROUND_STOP_STARTED", payload: {}, explanation: "x" };
    await db.insert(events).values([
      { ...base, eventKey: ids.oldEventKey, occurredAt: old },
      { ...base, eventKey: ids.newEventKey, occurredAt: now },
    ]);
    await db.insert(jobRuns).values({ id: ids.oldJobRun, job: "poll", startedAt: old, outcome: "success" });
    await db.insert(alertLog).values({
      eventId: crypto.randomUUID(),
      eventKey: ids.oldAlert,
      eventType: "GROUND_STOP_STARTED",
      userId: user.id,
      snapshotStoredAt: old,
      createdAt: new Date(now.getTime() - 72 * HOUR),
    });
    await db.insert(sessions).values({
      userId: user.id,
      tokenHash: ids.expiredSession,
      createdAt: old,
      expiresAt: new Date(now.getTime() - HOUR),
    });
    await db.insert(magicLinks).values({
      email: user.email,
      tokenHash: ids.expiredLink,
      createdAt: old,
      expiresAt: new Date(now.getTime() - HOUR),
    });
  });

  afterAll(async () => {
    if (db === undefined) return;
    await db.delete(events).where(eq(events.eventKey, ids.oldEventKey));
    await db.delete(events).where(eq(events.eventKey, ids.newEventKey));
    await db.delete(snapshots).where(eq(snapshots.id, ids.oldSnapshot));
    await db.delete(snapshots).where(eq(snapshots.id, ids.newSnapshot));
    await db.delete(jobRuns).where(eq(jobRuns.id, ids.oldJobRun));
    await db.delete(magicLinks).where(eq(magicLinks.tokenHash, ids.expiredLink));
    await deleteUserById(db, ids.userId); // cascades sessions and alert_log
  });

  const present = async () => ({
    oldSnapshot: (await db.select().from(snapshots).where(eq(snapshots.id, ids.oldSnapshot))).length,
    newSnapshot: (await db.select().from(snapshots).where(eq(snapshots.id, ids.newSnapshot))).length,
    oldEvent: (await db.select().from(events).where(eq(events.eventKey, ids.oldEventKey))).length,
    newEvent: (await db.select().from(events).where(eq(events.eventKey, ids.newEventKey))).length,
    oldJobRun: (await db.select().from(jobRuns).where(eq(jobRuns.id, ids.oldJobRun))).length,
    oldAlert: (await db.select().from(alertLog).where(eq(alertLog.eventKey, ids.oldAlert))).length,
    session: (await db.select().from(sessions).where(eq(sessions.tokenHash, ids.expiredSession))).length,
    link: (await db.select().from(magicLinks).where(eq(magicLinks.tokenHash, ids.expiredLink))).length,
  });

  it("a batch that fails on its last statement leaves every row in place", async () => {
    const failing = db.insert(events).values({
      eventKey: `it-fail-${tag}`,
      snapshotId: ids.newSnapshot,
      type: "GROUND_STOP_STARTED",
      occurredAt: now,
      payload: {},
      explanation: null as unknown as string,
    });

    await expect(db.batch([...cleanupStatements(db, now), failing])).rejects.toThrow();

    expect(await present()).toEqual({
      oldSnapshot: 1,
      newSnapshot: 1,
      oldEvent: 1,
      newEvent: 1,
      oldJobRun: 1,
      oldAlert: 1,
      session: 1,
      link: 1,
    });
  });

  it("a successful cleanup removes expired rows and keeps current ones", async () => {
    await createRepositories(db).cleanup(now);

    expect(await present()).toEqual({
      oldSnapshot: 0,
      newSnapshot: 1,
      oldEvent: 0,
      newEvent: 1,
      oldJobRun: 0,
      oldAlert: 0,
      session: 0,
      link: 0,
    });
  });
});
