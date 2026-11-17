import { createLogger, type Logger } from "@aerobrief/core";
import { describe, expect, it, vi } from "vitest";
import { runCleanup, type CleanupRepositories } from "../src/cleanup";
import type { Env } from "../src/env";

const env: Env = {
  DATABASE_URL: "postgresql://user:pass@host.neon.tech/db",
  RESEND_API_KEY: "re_secret_value",
  UNSUBSCRIBE_SECRET: "unsub_secret_value",
  FRONTEND_URL: "https://aerobrief.example.com",
  MAIL_FROM: "AeroBrief <alerts@example.com>",
};
const now = new Date("2025-01-02T12:00:00.000Z");

function setup() {
  const repos = {
    cleanup: vi.fn(async (_now: Date) => undefined),
    jobRuns: { recordFailure: vi.fn(async () => undefined) },
  };
  const lines: string[] = [];
  const push = (line: string) => void lines.push(line);
  const logger: Logger = createLogger(
    [env.DATABASE_URL, env.RESEND_API_KEY, env.UNSUBSCRIBE_SECRET],
    { debug: push, info: push, warn: push, error: push },
  );
  const run = () =>
    runCleanup(env, now, { createRepositories: () => repos as unknown as CleanupRepositories, logger });
  return { repos, lines, run };
}

describe("runCleanup", () => {
  it("calls cleanup once with now and records no failure on success", async () => {
    const { repos, run } = setup();
    await run();
    expect(repos.cleanup).toHaveBeenCalledTimes(1);
    expect(repos.cleanup).toHaveBeenCalledWith(now);
    expect(repos.jobRuns.recordFailure).not.toHaveBeenCalled();
  });

  it("records a cleanup failure and does not throw when cleanup throws", async () => {
    const { repos, lines, run } = setup();
    repos.cleanup.mockRejectedValueOnce(new Error(`batch failed at ${env.DATABASE_URL}`));
    await expect(run()).resolves.toBeUndefined();
    expect(repos.jobRuns.recordFailure).toHaveBeenCalledTimes(1);
    const [kind, detail, startedAt, finishedAt, job] = repos.jobRuns.recordFailure.mock
      .calls[0] as unknown as [string, string, Date, Date, string];
    expect(kind).toBe("storage");
    expect(job).toBe("cleanup");
    expect(detail).toContain("batch failed");
    expect(detail).not.toContain(env.DATABASE_URL);
    expect(startedAt).toEqual(now);
    expect(finishedAt).toBeInstanceOf(Date);
    expect(lines.join("\n")).not.toContain(env.DATABASE_URL);
  });

  it("logs, without rethrowing or leaking DATABASE_URL, when recordFailure throws", async () => {
    const { repos, lines, run } = setup();
    repos.cleanup.mockRejectedValueOnce(new Error("batch failed"));
    repos.jobRuns.recordFailure.mockRejectedValueOnce(new Error(`cannot reach ${env.DATABASE_URL}`));
    await expect(run()).resolves.toBeUndefined();
    const log = lines.join("\n");
    expect(log).toContain("cleanup_failure_record_failed");
    expect(log).not.toContain(env.DATABASE_URL);
  });
});
