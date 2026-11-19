import type { Snapshot } from "@aerobrief/core";
import { alertLogRepository } from "./alert-log";
import { cleanupRepository } from "./cleanup";
import type { Db } from "./client";
import { eventRepository, insertEventsQuery, type NewEvent, type StoredEvent } from "./events";
import { jobRunRepository, successJobRunQuery } from "./job-runs";
import { magicLinkRepository } from "./magic-links";
import { pollerLeaseRepository } from "./poller-lease";
import { sessionRepository } from "./sessions";
import { insertSnapshotQuery, snapshotRepository } from "./snapshots";
import { subscriptionRepository } from "./subscriptions";
import { userRepository } from "./users";
import { webhookRepository } from "../webhooks";

export * from "./alert-log";
export * from "./client";
export * from "./cleanup";
export * from "./events";
export * from "./job-runs";
export * from "./magic-links";
export * from "./poller-lease";
export * from "./sessions";
export * from "./snapshots";
export * from "./subscriptions";
export * from "./users";

export type StorePollResultInput = {
  snapshot: Snapshot;
  events: readonly NewEvent[];
  startedAt: Date;
  finishedAt: Date;
};

/**
 * Snapshot, Events and the success job_run commit in one db.batch, which neon-http runs as a
 * single transaction (Requirement 2.7). Returns only the Events that were newly inserted.
 */
export function storePollResultBatch(db: Db, input: StorePollResultInput) {
  const snapshotStmt = insertSnapshotQuery(db, input.snapshot);
  const jobStmt = successJobRunQuery(db, {
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    snapshotId: input.snapshot.id,
  });
  const [first, ...rest] = input.events;
  const eventsStmt = first === undefined ? null : insertEventsQuery(db, [first, ...rest]);
  return { snapshotStmt, eventsStmt, jobStmt };
}

export function createRepositories(db: Db) {
  return {
    snapshots: snapshotRepository(db),
    events: eventRepository(db),
    jobRuns: jobRunRepository(db),
    pollerLease: pollerLeaseRepository(db),
    cleanup: cleanupRepository(db).cleanup,
    users: userRepository(db),
    sessions: sessionRepository(db),
    magicLinks: magicLinkRepository(db),
    subscriptions: subscriptionRepository(db),
    alertLog: alertLogRepository(db),
    webhooks: webhookRepository(db),
    async storePollResult(input: StorePollResultInput): Promise<StoredEvent[]> {
      const { snapshotStmt, eventsStmt, jobStmt } = storePollResultBatch(db, input);
      if (eventsStmt === null) {
        await db.batch([snapshotStmt, jobStmt]);
        return [];
      }
      const [, inserted] = await db.batch([snapshotStmt, eventsStmt, jobStmt]);
      return inserted;
    },
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
