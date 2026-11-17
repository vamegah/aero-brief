import { createRepositories, events, jobRuns, snapshots, type Db } from "@aerobrief/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectTestDb, hasTestDb, makeSnapshot } from "./test-db";

// Requirement 2.7: Snapshot, Events and the success job_run commit together or not at all.
describe.skipIf(!hasTestDb)("atomic Snapshot + Events batch (integration)", () => {
  let db: Db;
  const snapshotIds: string[] = [];

  beforeAll(() => {
    db = connectTestDb();
  });

  afterAll(async () => {
    if (db === undefined) return;
    for (const id of snapshotIds) {
      await db.delete(events).where(eq(events.snapshotId, id));
      await db.delete(jobRuns).where(eq(jobRuns.snapshotId, id));
      await db.delete(snapshots).where(eq(snapshots.id, id));
    }
  });

  const countRows = async (snapshotId: string) => {
    const s = await db.select().from(snapshots).where(eq(snapshots.id, snapshotId));
    const e = await db.select().from(events).where(eq(events.snapshotId, snapshotId));
    const j = await db.select().from(jobRuns).where(eq(jobRuns.snapshotId, snapshotId));
    return { snapshots: s.length, events: e.length, jobRuns: j.length };
  };

  it("a failing Event insert leaves zero rows from the batch", async () => {
    const repos = createRepositories(db);
    const now = new Date();
    const snapshot = makeSnapshot(now);
    snapshotIds.push(snapshot.id);

    const good = {
      eventKey: `it-${crypto.randomUUID()}`,
      snapshotId: snapshot.id,
      type: "GROUND_STOP_STARTED",
      airportId: "ATL",
      occurredAt: now,
      payload: {},
      explanation: "ok",
    };
    // NOT NULL violation on the second row fails the whole statement, and with it the batch.
    const bad = { ...good, eventKey: `it-${crypto.randomUUID()}`, explanation: null as unknown as string };

    await expect(
      repos.storePollResult({ snapshot, events: [good, bad], startedAt: now, finishedAt: now }),
    ).rejects.toThrow();

    expect(await countRows(snapshot.id)).toEqual({ snapshots: 0, events: 0, jobRuns: 0 });
  });

  it("a valid batch stores the Snapshot, Events and job_run together", async () => {
    const repos = createRepositories(db);
    const now = new Date();
    const snapshot = makeSnapshot(now);
    snapshotIds.push(snapshot.id);

    const inserted = await repos.storePollResult({
      snapshot,
      events: [
        {
          eventKey: `it-${crypto.randomUUID()}`,
          snapshotId: snapshot.id,
          type: "GROUND_STOP_STARTED",
          airportId: "ATL",
          occurredAt: now,
          payload: {},
          explanation: "ok",
        },
      ],
      startedAt: now,
      finishedAt: now,
    });

    expect(inserted).toHaveLength(1);
    expect(await countRows(snapshot.id)).toEqual({ snapshots: 1, events: 1, jobRuns: 1 });
  });
});
