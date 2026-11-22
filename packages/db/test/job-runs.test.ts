import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it } from "vitest";
import { jobRunRepository, latestPollRunQuery } from "../src/repositories/job-runs";
import * as schema from "../src/schema";

type Call = { sql: string; params: unknown[] };

/** Fake neon-http client: records each statement and answers with queued rows (array mode). */
function fakeDb(responses: Array<unknown[][] | Error> = []) {
  const calls: Call[] = [];
  const client = async (sql: string, params: unknown[]) => {
    calls.push({ sql: sql.replace(/\s+/g, " ").toLowerCase(), params });
    const next = responses.shift() ?? [];
    if (next instanceof Error) throw next;
    return { rows: next, rowCount: next.length, fields: [] };
  };
  const db = drizzle({ client: client as never, schema });
  return { db, calls };
}

describe("latestPollRun", () => {
  it("selects only outcome and started_at of the newest poll row", () => {
    const q = latestPollRunQuery(fakeDb().db).toSQL();
    const sql = q.sql.replace(/\s+/g, " ").toLowerCase();
    expect(sql).toContain('select "outcome", "started_at" from "job_runs"');
    expect(sql).toContain('"job_runs"."job" = $1');
    expect(sql).toContain('order by "job_runs"."started_at" desc limit $2');
    expect(q.params).toEqual(["poll", 1]);
  });

  it("returns the outcome and a Date startedAt", async () => {
    const { db, calls } = fakeDb([[["failed", "2025-01-02T07:30:00.000Z"]]]);
    const run = await jobRunRepository(db).latestPollRun();
    expect(run).toEqual({ outcome: "failed", startedAt: new Date("2025-01-02T07:30:00.000Z") });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql.startsWith("select")).toBe(true);
  });

  it("returns success rows as success", async () => {
    const { db } = fakeDb([[["success", "2025-01-02T07:30:00.000Z"]]]);
    expect((await jobRunRepository(db).latestPollRun())?.outcome).toBe("success");
  });

  it("returns null when there are no poll rows", async () => {
    expect(await jobRunRepository(fakeDb([[]]).db).latestPollRun()).toBeNull();
  });

  it("returns null for an unknown outcome value", async () => {
    const { db } = fakeDb([[["running", "2025-01-02T07:30:00.000Z"]]]);
    expect(await jobRunRepository(db).latestPollRun()).toBeNull();
  });
});
