import { createLogger, type Logger } from "@aerobrief/core";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import { FAA_API_URL, type FetchFn } from "../src/faa-client";
import { LEASE_TTL_MS, runPoll, type PollDeps, type PollRepositories } from "../src/poll";

const env: Env = {
  DATABASE_URL: "postgresql://user:pass@host.neon.tech/db",
  RESEND_API_KEY: "re_secret_value",
  UNSUBSCRIBE_SECRET: "unsub_secret_value",
  FRONTEND_URL: "https://aerobrief.example.com",
  MAIL_FROM: "AeroBrief <alerts@example.com>",
};
const now = new Date("2025-01-02T12:00:00.000Z");
const TOKEN = "lease-token-1";

const okBody = JSON.stringify([{ airportId: "JFK", airportLongName: "John F Kennedy", groundStop: null }]);

function setup(opts: { token?: string | null; fetchFn?: FetchFn } = {}) {
  const repos = {
    snapshots: { latestSnapshot: vi.fn(async () => null) },
    jobRuns: { recordFailure: vi.fn(async () => undefined) },
    pollerLease: {
      acquire: vi.fn(async () => (opts.token === undefined ? TOKEN : opts.token)),
      release: vi.fn(async () => undefined),
    },
    storePollResult: vi.fn(async (_input: unknown): Promise<unknown[]> => []),
    subscriptions: { watchersOfAirport: vi.fn(async () => []), usersWithWatchlist: vi.fn(async () => []) },
    alertLog: { claim: vi.fn(async () => []), recordOutcome: vi.fn(async () => undefined), recordLatency: vi.fn(async () => undefined) },
  };
  const notifyFn = vi.fn(async (_deps: unknown, _input: unknown) => ({ skippedStale: false, claimed: 0, handedOff: 0, failed: 0 }));
  const fetchFn = vi.fn<FetchFn>(opts.fetchFn ?? (async () => new Response(okBody, { status: 200 })));
  const lines: string[] = [];
  const push = (line: string) => void lines.push(line);
  const logger: Logger = createLogger(
    [env.DATABASE_URL, env.RESEND_API_KEY, env.UNSUBSCRIBE_SECRET],
    { debug: push, info: push, warn: push, error: push },
  );
  const run = () =>
    runPoll(env, now, {
      fetchFn,
      createRepositories: () => repos as unknown as PollRepositories,
      logger,
      notifyFn: notifyFn as unknown as NonNullable<PollDeps["notifyFn"]>,
    });
  return { repos, fetchFn, lines, run, notifyFn };
}

describe("runPoll", () => {
  it("stores one Snapshot and records no failure on success", async () => {
    const { repos, run } = setup();
    await run();
    expect(repos.pollerLease.acquire).toHaveBeenCalledWith(now, LEASE_TTL_MS);
    expect(repos.storePollResult).toHaveBeenCalledTimes(1);
    const arg = (repos.storePollResult.mock.calls[0] as unknown as [unknown])[0] as {
      snapshot: { airports: unknown[] };
      events: unknown[];
      startedAt: Date;
    };
    expect(arg.snapshot.airports).toHaveLength(20);
    expect(arg.events).toEqual([]);
    expect(arg.startedAt).toEqual(now);
    expect(repos.jobRuns.recordFailure).not.toHaveBeenCalled();
  });

  const failures: [string, FetchFn][] = [
    [
      "timeout",
      async () => {
        throw new DOMException("timed out", "TimeoutError");
      },
    ],
    ["http_status", async () => new Response("boom", { status: 503 })],
    [
      "network",
      async () => {
        throw new TypeError("connection reset");
      },
    ],
    ["unparseable", async () => new Response("<html>not json", { status: 200 })],
    ["validation", async () => new Response(JSON.stringify({ not: "an array" }), { status: 200 })],
  ];

  it.each(failures)("%s records one failed job_run and stores nothing", async (kind, fetchFn) => {
    const { repos, run } = setup({ fetchFn });
    await run();
    expect(repos.jobRuns.recordFailure).toHaveBeenCalledTimes(1);
    const [recordedKind, detail, startedAt, finishedAt] = repos.jobRuns.recordFailure.mock.calls[0] as unknown as [
      string,
      string,
      Date,
      Date,
    ];
    expect(recordedKind).toBe(kind);
    expect(detail.length).toBeGreaterThan(0);
    expect(startedAt).toEqual(now);
    expect(finishedAt).toBeInstanceOf(Date);
    expect(repos.storePollResult).not.toHaveBeenCalled();
  });

  it("does nothing when the lease is held", async () => {
    const { repos, fetchFn, run } = setup({ token: null });
    await run();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(repos.jobRuns.recordFailure).not.toHaveBeenCalled();
    expect(repos.storePollResult).not.toHaveBeenCalled();
    expect(repos.pollerLease.release).not.toHaveBeenCalled();
  });

  it("records a storage failure when storePollResult throws", async () => {
    const { repos, run } = setup();
    repos.storePollResult.mockRejectedValueOnce(new Error("batch rolled back"));
    await run();
    expect(repos.jobRuns.recordFailure).toHaveBeenCalledTimes(1);
    const [kind, detail] = repos.jobRuns.recordFailure.mock.calls[0] as unknown as [string, string];
    expect(kind).toBe("storage");
    expect(detail).toContain("batch rolled back");
  });

  it("records a storage failure and stores nothing when reading the previous Snapshot throws", async () => {
    const { repos, run } = setup();
    repos.snapshots.latestSnapshot.mockRejectedValueOnce(new Error("read failed"));
    await run();
    expect(repos.jobRuns.recordFailure).toHaveBeenCalledTimes(1);
    expect((repos.jobRuns.recordFailure.mock.calls[0] as unknown as [string])[0]).toBe("storage");
    expect(repos.storePollResult).not.toHaveBeenCalled();
  });

  it("truncates and redacts failure detail before recording it", async () => {
    const { repos, run } = setup({
      fetchFn: async () => {
        throw new TypeError(`${env.DATABASE_URL} ${"x".repeat(500)}`);
      },
    });
    await run();
    const detail = (repos.jobRuns.recordFailure.mock.calls[0] as unknown as [string, string])[1];
    expect(detail).not.toContain(env.DATABASE_URL);
    expect(detail.length).toBeLessThanOrEqual(201);
  });

  it("releases the lease with the acquired token on success, failure and throw", async () => {
    const ok = setup();
    await ok.run();
    expect(ok.repos.pollerLease.release).toHaveBeenCalledWith(TOKEN, now);

    const failed = setup({ fetchFn: async () => new Response("x", { status: 500 }) });
    await failed.run();
    expect(failed.repos.pollerLease.release).toHaveBeenCalledWith(TOKEN, now);

    const thrown = setup();
    thrown.repos.storePollResult.mockRejectedValueOnce(new Error("boom"));
    thrown.repos.jobRuns.recordFailure.mockRejectedValueOnce(new Error("db down"));
    await expect(thrown.run()).resolves.toBeUndefined();
    expect(thrown.repos.pollerLease.release).toHaveBeenCalledTimes(1);
    expect(thrown.repos.pollerLease.release).toHaveBeenCalledWith(TOKEN, now);
  });

  it("logs, without rethrowing or leaking secrets, when recordFailure and release throw", async () => {
    const { repos, lines, run } = setup({ fetchFn: async () => new Response("x", { status: 500 }) });
    repos.jobRuns.recordFailure.mockRejectedValueOnce(new Error(`cannot reach ${env.DATABASE_URL}`));
    repos.pollerLease.release.mockRejectedValueOnce(new Error("release failed"));
    await expect(run()).resolves.toBeUndefined();
    const log = lines.join("\n");
    expect(log).toContain("poll_failure_record_failed");
    expect(log).toContain("poll_lease_release_failed");
    expect(log).not.toContain(env.DATABASE_URL);
  });

  it("fetches only FAA_API_URL", async () => {
    const { fetchFn, run } = setup();
    await run();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]?.[0]).toBe(FAA_API_URL);
  });

  const jfkStop = JSON.stringify([
    { airportId: "JFK", airportLongName: "John F Kennedy", groundStop: { id: "g1", reason: "weather" } },
  ]);

  it("detects changes, stores Events with the Snapshot, and notifies only inserted Events", async () => {
    const { repos, notifyFn, run } = setup({ fetchFn: async () => new Response(jfkStop, { status: 200 }) });
    const stored = [{ id: "e1", eventKey: "faa:g1", type: "GROUND_STOP_STARTED", airportId: "JFK", occurredAt: now, explanation: "x" }];
    repos.storePollResult.mockResolvedValueOnce(stored);
    await run();
    const arg = repos.storePollResult.mock.calls[0]?.[0] as { events: { eventKey: string; type: string; airportId: string; explanation: string }[] };
    expect(arg.events).toHaveLength(1);
    expect(arg.events[0]).toMatchObject({ eventKey: "faa:g1", type: "GROUND_STOP_STARTED", airportId: "JFK" });
    expect(arg.events[0]?.explanation.length).toBeGreaterThan(0);
    expect(notifyFn).toHaveBeenCalledTimes(1);
    const input = notifyFn.mock.calls[0]?.[1] as { events: unknown[]; storedAt: Date };
    expect(input.events).toBe(stored);
    expect(input.storedAt).toBeInstanceOf(Date);
  });

  it("does not notify when no Event was newly inserted", async () => {
    const { notifyFn, run } = setup({ fetchFn: async () => new Response(jfkStop, { status: 200 }) });
    await run(); // storePollResult returns [] (all conflicts)
    expect(notifyFn).not.toHaveBeenCalled();
  });

  it("keeps stored data and records no failure when the Notifier throws", async () => {
    const { repos, notifyFn, lines, run } = setup({ fetchFn: async () => new Response(jfkStop, { status: 200 }) });
    repos.storePollResult.mockResolvedValueOnce([{ id: "e1" }]);
    notifyFn.mockRejectedValueOnce(new Error(`mail down ${env.RESEND_API_KEY}`));
    await expect(run()).resolves.toBeUndefined();
    expect(repos.jobRuns.recordFailure).not.toHaveBeenCalled();
    expect(repos.pollerLease.release).toHaveBeenCalledTimes(1);
    const log = lines.join("\n");
    expect(log).toContain("poll_notify_failed");
    expect(log).not.toContain(env.RESEND_API_KEY);
  });
});
