import { createLogger, type Logger, type PreviousPollRun } from "@aerobrief/core";
import fc from "fast-check";
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
    jobRuns: {
      recordFailure: vi.fn(async () => undefined),
      latestPollRun: vi.fn(async (): Promise<PreviousPollRun | null> => null),
    },
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

describe("runPoll upstream warning", () => {
  const http403: FetchFn = async () => new Response("Access Denied", { status: 403 });
  const warns = (lines: string[]) => lines.filter((l) => l.includes("faa_upstream_non_2xx"));

  it("warns once on the first 403 and still records the failure", async () => {
    const { repos, lines, run } = setup({ fetchFn: http403 });
    await run();
    expect(warns(lines)).toHaveLength(1);
    expect(warns(lines)[0]).toContain("HTTP 403");
    expect(repos.jobRuns.recordFailure).toHaveBeenCalledTimes(1);
  });

  it("reads the previous run before recording the failure", async () => {
    const { repos, run } = setup({ fetchFn: http403 });
    await run();
    const read = repos.jobRuns.latestPollRun.mock.invocationCallOrder[0] as number;
    const write = repos.jobRuns.recordFailure.mock.invocationCallOrder[0] as number;
    expect(read).toBeLessThan(write);
  });

  it("does not warn when the previous run failed in the same UTC hour", async () => {
    const { repos, lines, run } = setup({ fetchFn: http403 });
    repos.jobRuns.latestPollRun.mockResolvedValueOnce({
      outcome: "failed",
      startedAt: new Date("2025-01-02T12:00:00.000Z"),
    });
    await run();
    expect(warns(lines)).toHaveLength(0);
    expect(repos.jobRuns.recordFailure).toHaveBeenCalledTimes(1);
  });

  it("warns when the previous failure was in an earlier UTC hour", async () => {
    const { repos, lines, run } = setup({ fetchFn: http403 });
    repos.jobRuns.latestPollRun.mockResolvedValueOnce({
      outcome: "failed",
      startedAt: new Date("2025-01-02T11:55:00.000Z"),
    });
    await run();
    expect(warns(lines)).toHaveLength(1);
  });

  it("still records the failure and warns when reading the previous run throws", async () => {
    const { repos, lines, run } = setup({ fetchFn: http403 });
    repos.jobRuns.latestPollRun.mockRejectedValueOnce(new Error(`down ${env.DATABASE_URL}`));
    await expect(run()).resolves.toBeUndefined();
    expect(repos.jobRuns.recordFailure).toHaveBeenCalledTimes(1);
    expect(warns(lines)).toHaveLength(1);
    expect(lines.join("\n")).not.toContain(env.DATABASE_URL);
    expect(repos.pollerLease.release).toHaveBeenCalledTimes(1);
  });

  it("contains no secret in the warning line", async () => {
    const { lines, run } = setup({ fetchFn: async () => new Response(env.RESEND_API_KEY, { status: 403 }) });
    await run();
    const log = lines.join("\n");
    for (const s of [env.DATABASE_URL, env.RESEND_API_KEY, env.UNSUBSCRIBE_SECRET]) expect(log).not.toContain(s);
  });

  it("does not read the previous run or warn on success or non-http failures", async () => {
    const ok = setup();
    await ok.run();
    expect(ok.repos.jobRuns.latestPollRun).not.toHaveBeenCalled();
    expect(warns(ok.lines)).toHaveLength(0);
    const net = setup({
      fetchFn: async () => {
        throw new TypeError("reset");
      },
    });
    await net.run();
    expect(net.repos.jobRuns.latestPollRun).not.toHaveBeenCalled();
    expect(warns(net.lines)).toHaveLength(0);
  });
});

describe("runPoll relay destinations (Property 5)", () => {
  const VALID_URL = "https://www.aerobriefs.com/api/internal/faa-relay";
  const secretArb = fc.stringMatching(/^[A-Za-z0-9]{32,64}$/);
  const shortSecretArb = fc.stringMatching(/^[A-Za-z0-9]{1,31}$/);
  const badUrlArb = fc.constantFrom(
    "http://www.aerobriefs.com/api/internal/faa-relay",
    "https://www.aerobriefs.com.evil.com/api/internal/faa-relay",
    "https://evil.example/api/internal/faa-relay",
    "https://user:pw@www.aerobriefs.com/api/internal/faa-relay",
    "https://www.aerobriefs.com:8443/api/internal/faa-relay",
    "https://www.aerobriefs.com/api/internal/faa-relay?x=1",
    "https://www.aerobriefs.com/other",
    "https://nasstatus.faa.gov/api/airport-events",
    "not a url",
  );
  const unsetArb = fc.constantFrom<string | undefined>(undefined, "");

  type Cfg = { url: string | undefined; secret: string | undefined };
  const cfgArb: fc.Arbitrary<Cfg> = fc.oneof(
    fc.record({ url: unsetArb, secret: unsetArb }),
    fc.record({ url: fc.constant<string | undefined>(VALID_URL), secret: secretArb }),
    fc.record({ url: fc.constant<string | undefined>(VALID_URL), secret: unsetArb }),
    fc.record({ url: unsetArb, secret: secretArb }),
    fc.record({ url: fc.constant<string | undefined>(VALID_URL), secret: shortSecretArb }),
    fc.record({ url: badUrlArb, secret: secretArb }),
  );
  const outcomeArb = fc.oneof(
    fc.constant({ kind: "ok" as const }),
    fc.integer({ min: 300, max: 599 }).map((status) => ({ kind: "status" as const, status })),
    fc.constant({ kind: "throw" as const }),
    fc.constant({ kind: "bad" as const }),
  );

  // Feature: faa-403-poller, Property 5: The poller calls only the FAA URL or the configured relay URL
  // **Validates: Requirements 2.4, 2.5, 3.1**
  it("calls the FAA URL (unset), the relay URL (valid) or nothing (invalid, validation failure naming keys only)", async () => {
    await fc.assert(
      fc.asyncProperty(cfgArb, outcomeArb, async (cfg, outcome) => {
        const calls: { url: string; headers: Record<string, string> }[] = [];
        const recorded: { kind: string; detail: string }[] = [];
        const levels: { level: string; line: string }[] = [];
        const sink = (level: string) => (line: string) => void levels.push({ level, line });
        const logger = createLogger([], { debug: sink("debug"), info: sink("info"), warn: sink("warn"), error: sink("error") });
        const repos = {
          snapshots: { latestSnapshot: async () => null },
          jobRuns: {
            latestPollRun: async () => null,
            recordFailure: async (kind: string, detail: string) => void recorded.push({ kind, detail }),
          },
          pollerLease: { acquire: async () => "t", release: vi.fn(async () => undefined) },
          storePollResult: async () => [],
          subscriptions: { watchersOfAirport: async () => [], usersWithWatchlist: async () => [] },
          alertLog: { claim: async () => [], recordOutcome: async () => undefined, recordLatency: async () => undefined },
        };
        const fetchFn: FetchFn = async (url, init) => {
          calls.push({ url, headers: init.headers ?? {} });
          if (outcome.kind === "throw") throw new TypeError("boom");
          if (outcome.kind === "status") return new Response(null, { status: outcome.status });
          if (outcome.kind === "bad") return new Response("<html>", { status: 200 });
          return new Response(okBody, { status: 200 });
        };
        await runPoll(
          { ...env, ...(cfg.url !== undefined ? { FAA_RELAY_URL: cfg.url } : {}), ...(cfg.secret !== undefined ? { FAA_RELAY_SECRET: cfg.secret } : {}) },
          now,
          { fetchFn, createRepositories: () => repos as unknown as PollRepositories, logger, notifyFn: (async () => ({})) as unknown as NonNullable<PollDeps["notifyFn"]> },
        );

        const url = cfg.url ?? "";
        const secret = cfg.secret ?? "";
        const mode = url === "" && secret === "" ? "direct" : url === VALID_URL && secret.length >= 32 ? "relay" : "invalid";
        if (mode === "direct") {
          expect(calls.map((c) => c.url)).toEqual([FAA_API_URL]);
          expect(Object.keys(calls[0]?.headers ?? {})).toHaveLength(0);
        } else if (mode === "relay") {
          expect(calls.map((c) => c.url)).toEqual([VALID_URL]);
          expect(calls[0]?.headers["x-aerobrief-relay-key"]).toBe(secret);
        } else {
          expect(calls).toHaveLength(0);
          expect(recorded).toHaveLength(1);
          expect(recorded[0]?.kind).toBe("validation");
          expect(recorded[0]?.detail).toMatch(/^Invalid relay settings: FAA_RELAY_(URL|SECRET)(, FAA_RELAY_SECRET)?$/);
          if (url.length >= 8) expect(recorded[0]?.detail).not.toContain(url);
          if (secret.length >= 8) expect(recorded[0]?.detail).not.toContain(secret);
          const entry = levels.filter((l) => l.line.includes("faa_relay_config_invalid"));
          expect(entry).toHaveLength(1);
          expect(entry[0]?.level).toBe("error");
          if (secret.length >= 8) expect(levels.some((l) => l.line.includes(secret))).toBe(false);
        }
        expect(repos.pollerLease.release).toHaveBeenCalledTimes(1);
      }),
      { numRuns: 200 },
    );
  });

  it.each([
    ["only the URL is set", VALID_URL, undefined, "FAA_RELAY_SECRET"],
    ["only the secret is set", undefined, "s".repeat(32), "FAA_RELAY_URL"],
    ["http: URL", "http://www.aerobriefs.com/api/internal/faa-relay", "s".repeat(32), "FAA_RELAY_URL"],
    ["lookalike host", "https://www.aerobriefs.com.evil.com/api/internal/faa-relay", "s".repeat(32), "FAA_RELAY_URL"],
    ["other host", "https://evil.example/api/internal/faa-relay", "s".repeat(32), "FAA_RELAY_URL"],
    ["userinfo", "https://u:p@www.aerobriefs.com/api/internal/faa-relay", "s".repeat(32), "FAA_RELAY_URL"],
    ["short secret", VALID_URL, "short", "FAA_RELAY_SECRET"],
  ])("invalid relay config (%s) makes no request and names only %s", async (_label, url, secret, key) => {
    const { repos, fetchFn, lines } = setup();
    await runPoll(
      { ...env, ...(url ? { FAA_RELAY_URL: url } : {}), ...(secret ? { FAA_RELAY_SECRET: secret } : {}) },
      now,
      {
        fetchFn,
        createRepositories: () => repos as unknown as PollRepositories,
        logger: createLogger([], { debug: () => undefined, info: () => undefined, warn: () => undefined, error: (l) => void lines.push(l) }),
      },
    );
    expect(fetchFn).not.toHaveBeenCalled();
    expect(repos.jobRuns.recordFailure).toHaveBeenCalledTimes(1);
    const [kind, detail] = repos.jobRuns.recordFailure.mock.calls[0] as unknown as [string, string];
    expect(kind).toBe("validation");
    expect(detail).toBe(`Invalid relay settings: ${key}`);
    expect(lines.some((l) => l.includes("faa_relay_config_invalid"))).toBe(true);
    expect(repos.pollerLease.release).toHaveBeenCalledTimes(1);
  });
});
