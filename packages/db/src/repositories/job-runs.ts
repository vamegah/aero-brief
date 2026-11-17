import { desc, eq } from "drizzle-orm";
import { jobRuns } from "../schema";
import type { Db } from "./client";

export const FAILURE_KINDS = ["timeout", "http_status", "network", "unparseable", "validation", "storage"] as const;
export type FailureKind = (typeof FAILURE_KINDS)[number];

export type JobName = "poll" | "cleanup";

export function successJobRunQuery(
  db: Db,
  run: { job?: JobName; startedAt: Date; finishedAt: Date; snapshotId?: string | null },
) {
  return db.insert(jobRuns).values({
    job: run.job ?? "poll",
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    outcome: "success",
    snapshotId: run.snapshotId ?? null,
  });
}

export function failureJobRunQuery(
  db: Db,
  run: { job?: JobName; kind: FailureKind; detail: string; startedAt: Date; finishedAt: Date },
) {
  return db.insert(jobRuns).values({
    job: run.job ?? "poll",
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    outcome: "failed",
    failureKind: run.kind,
    detail: run.detail,
  });
}

export function latestFailureQuery(db: Db) {
  return db.select().from(jobRuns).where(eq(jobRuns.outcome, "failed")).orderBy(desc(jobRuns.startedAt)).limit(1);
}

export function jobRunRepository(db: Db) {
  return {
    async recordSuccess(startedAt: Date, finishedAt: Date, snapshotId?: string | null): Promise<void> {
      await successJobRunQuery(db, { startedAt, finishedAt, snapshotId: snapshotId ?? null });
    },
    /** `job` defaults to "poll"; cleanup passes "cleanup" (design: job_runs.job). */
    async recordFailure(
      kind: FailureKind,
      detail: string,
      startedAt: Date,
      finishedAt: Date,
      job: JobName = "poll",
    ): Promise<void> {
      await failureJobRunQuery(db, { job, kind, detail, startedAt, finishedAt });
    },
  };
}
