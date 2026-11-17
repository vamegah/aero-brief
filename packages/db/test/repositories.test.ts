import { describe, expect, it } from "vitest";
import {
  acquireLeaseQuery,
  cleanupStatements,
  createDb,
  failureJobRunQuery,
  insertEventsQuery,
  latestSnapshotQuery,
  recentEventsQuery,
  releaseLeaseQuery,
  storePollResultBatch,
} from "../src/repositories";

// neon() only builds a fetch-based client; nothing connects until a query runs.
const db = createDb("postgresql://user:pass@db.invalid/aerobrief");

const now = new Date("2025-01-02T12:00:00.000Z");
const cutoff24h = "2025-01-01T12:00:00.000Z";
const cutoff48h = "2024-12-31T12:00:00.000Z";

const norm = (s: string) => s.replace(/\s+/g, " ").toLowerCase();
/** Drizzle may hand Dates or ISO strings to the driver; compare both as ISO strings. */
const iso = (params: readonly unknown[]) => params.map((p) => (p instanceof Date ? p.toISOString() : p));

describe("poller lease", () => {
  it("acquire is one conditional UPDATE on expiry, with RETURNING", () => {
    const q = acquireLeaseQuery(db, now, 180_000, "tok-1").toSQL();
    const sql = norm(q.sql);
    expect(sql).toContain('update "poller_lease" set "locked_until" = $1, "holder" = $2');
    expect(sql).toContain('"poller_lease"."id" = $3');
    expect(sql).toContain('"poller_lease"."locked_until" < $4');
    expect(sql).toContain("returning");
    expect(iso(q.params)).toEqual(["2025-01-02T12:03:00.000Z", "tok-1", 1, now.toISOString()]);
  });

  it("release expires the lease only for the holder token", () => {
    const q = releaseLeaseQuery(db, "tok-1", now).toSQL();
    expect(norm(q.sql)).toContain(
      'update "poller_lease" set "locked_until" = $1, "holder" = $2 where ("poller_lease"."id" = $3 and "poller_lease"."holder" = $4)',
    );
    expect(iso(q.params)).toEqual(["2025-01-02T11:59:59.999Z", null, 1, "tok-1"]);
  });
});

describe("events", () => {
  it("insert uses ON CONFLICT (event_key, type) DO NOTHING RETURNING", () => {
    const q = insertEventsQuery(db, [
      {
        eventKey: "faa:1",
        snapshotId: "00000000-0000-4000-8000-000000000001",
        type: "GROUND_STOP_STARTED",
        airportId: "ATL",
        occurredAt: now,
        payload: {},
        explanation: "x",
      },
    ]).toSQL();
    const sql = norm(q.sql);
    expect(sql).toMatch(/on conflict \("event_key",\s*"type"\) do nothing/);
    expect(sql).toContain("returning");
  });

  it("reads are bounded to the last 24 h", () => {
    const q = recentEventsQuery(db, now).toSQL();
    expect(norm(q.sql)).toContain('"events"."occurred_at" >= $1');
    expect(iso(q.params)[0]).toBe(cutoff24h);

    const byAirport = recentEventsQuery(db, now, "ATL").toSQL();
    expect(norm(byAirport.sql)).toContain('"events"."occurred_at" >= $1');
    expect(norm(byAirport.sql)).toContain('"events"."airport_id" = $2');
  });
});

describe("snapshots", () => {
  it("latest read is bounded to the last 24 h and takes the newest row", () => {
    const q = latestSnapshotQuery(db, now).toSQL();
    const sql = norm(q.sql);
    expect(sql).toContain('"snapshots"."captured_at" >= $1');
    expect(sql).toContain('order by "snapshots"."captured_at" desc');
    expect(sql).toContain("limit");
    expect(iso(q.params)[0]).toBe(cutoff24h);
  });
});

describe("job runs", () => {
  it("failure records kind and detail", () => {
    const q = failureJobRunQuery(db, {
      kind: "http_status",
      detail: "503",
      startedAt: now,
      finishedAt: now,
    }).toSQL();
    expect(norm(q.sql)).toContain('insert into "job_runs"');
    expect(iso(q.params)).toEqual(expect.arrayContaining(["failed", "http_status", "503"]));
  });
});

describe("cleanup", () => {
  it("is six DELETEs with the right cutoffs", () => {
    const stmts = cleanupStatements(db, now).map((s) => s.toSQL());
    expect(stmts).toHaveLength(6);
    const by = (table: string) => stmts.find((s) => norm(s.sql).startsWith(`delete from "${table}"`));

    expect(by("snapshots")?.params.map((p) => (p instanceof Date ? p.toISOString() : p))).toEqual([cutoff24h]);
    expect(norm(by("snapshots")?.sql ?? "")).toContain('"captured_at" < $1');
    expect(by("events")?.params.map((p) => (p instanceof Date ? p.toISOString() : p))).toEqual([cutoff24h]);
    expect(by("job_runs")?.params.map((p) => (p instanceof Date ? p.toISOString() : p))).toEqual([cutoff24h]);
    expect(by("alert_log")?.params.map((p) => (p instanceof Date ? p.toISOString() : p))).toEqual([cutoff48h]);
    expect(by("sessions")?.params.map((p) => (p instanceof Date ? p.toISOString() : p))).toEqual([now.toISOString()]);
    expect(by("magic_links")?.params.map((p) => (p instanceof Date ? p.toISOString() : p))).toEqual([now.toISOString()]);
  });
});

describe("storePollResult batch", () => {
  const snapshot = {
    id: "00000000-0000-4000-8000-000000000001",
    capturedAt: now.toISOString(),
    airports: [],
  } as never;

  it("builds snapshot and job_run statements, and omits events when empty", () => {
    const b = storePollResultBatch(db, { snapshot, events: [], startedAt: now, finishedAt: now });
    expect(b.eventsStmt).toBeNull();
    expect(norm(b.snapshotStmt.toSQL().sql)).toContain('insert into "snapshots"');
    expect(norm(b.jobStmt.toSQL().sql)).toContain('insert into "job_runs"');
  });
});
