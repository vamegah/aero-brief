import { beforeEach, describe, expect, it, vi } from "vitest";
import wrangler from "../wrangler.jsonc?raw";

vi.mock("../src/poll", () => ({ runPoll: vi.fn(async () => undefined) }));
vi.mock("../src/cleanup", () => ({ runCleanup: vi.fn(async () => undefined) }));
// Wrap the real runDigest so the spy records calls and the flag gate still runs.
vi.mock("../src/digest", async (importActual) => {
  const actual = await importActual<typeof import("../src/digest")>();
  return { ...actual, runDigest: vi.fn(actual.runDigest) };
});
vi.mock("@aerobrief/db", () => ({
  createDb: vi.fn(() => {
    throw new Error("createDb must not be called");
  }),
  createRepositories: vi.fn(() => {
    throw new Error("createRepositories must not be called");
  }),
}));

import { createDb, createRepositories } from "@aerobrief/db";
import type { Env } from "../src/env";
import { runDigest } from "../src/digest";
import { CLEANUP_CRON, DIGEST_CRON, POLL_CRON } from "../src/crons";
import worker from "../src/index";
import { runCleanup } from "../src/cleanup";
import { runPoll } from "../src/poll";

const env: Env = {
  DATABASE_URL: "postgresql://user:pass@host.neon.tech/db",
  RESEND_API_KEY: "re_secret_value",
  UNSUBSCRIBE_SECRET: "unsub_secret_value",
  FRONTEND_URL: "https://aerobrief.example.com",
  MAIL_FROM: "AeroBrief <alerts@example.com>",
};

function fire(cron: string, scheduledTime = 1_700_000_000_000): Promise<void> {
  const controller = { cron, scheduledTime, type: "scheduled", noRetry() {} } as ScheduledController;
  const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
  return Promise.resolve(worker.scheduled(controller, env, ctx));
}

describe("digest cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("DIGEST_CRON is the hourly string and matches wrangler.jsonc", () => {
    expect(DIGEST_CRON).toBe("0 * * * *");
    for (const cron of [POLL_CRON, CLEANUP_CRON, DIGEST_CRON]) {
      expect(wrangler).toContain(`"${cron}"`);
    }
  });

  it("routes the digest cron to runDigest only", async () => {
    await fire(DIGEST_CRON, 1_700_000_000_000);
    expect(runDigest).toHaveBeenCalledOnce();
    expect(runDigest).toHaveBeenCalledWith(env, new Date(1_700_000_000_000));
    expect(runPoll).not.toHaveBeenCalled();
    expect(runCleanup).not.toHaveBeenCalled();
  });

  it("makes no database or fetch call when the flag is off", async () => {
    const globalFetch = vi.spyOn(globalThis, "fetch");
    await fire(DIGEST_CRON);
    expect(runDigest).toHaveBeenCalledOnce();
    expect(createDb).not.toHaveBeenCalled();
    expect(createRepositories).not.toHaveBeenCalled();
    expect(globalFetch).not.toHaveBeenCalled();
    globalFetch.mockRestore();
  });
});
