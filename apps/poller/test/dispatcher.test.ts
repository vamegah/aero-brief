import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/poll", () => ({ runPoll: vi.fn(async () => undefined) }));
vi.mock("../src/cleanup", () => ({ runCleanup: vi.fn(async () => undefined) }));

import { runCleanup } from "../src/cleanup";
import { parseEnv, type Env } from "../src/env";
import worker from "../src/index";
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

describe("scheduled dispatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("routes */5 to runPoll with scheduledTime as Date", async () => {
    await fire("*/5 * * * *", 1_700_000_000_000);
    expect(runPoll).toHaveBeenCalledWith(env, new Date(1_700_000_000_000));
    expect(runCleanup).not.toHaveBeenCalled();
  });

  it("routes */30 to runCleanup", async () => {
    await fire("*/30 * * * *");
    expect(runCleanup).toHaveBeenCalledOnce();
    expect(runPoll).not.toHaveBeenCalled();
  });

  it("calls neither handler for an unknown cron", async () => {
    await fire("0 0 * * *");
    expect(runPoll).not.toHaveBeenCalled();
    expect(runCleanup).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledOnce();
  });
});

describe("parseEnv", () => {
  it("accepts a valid env", () => {
    expect(parseEnv(env)).toEqual(env);
  });

  it("names missing keys without echoing values", () => {
    const bad = { DATABASE_URL: "not-a-url-secret-xyz", RESEND_API_KEY: "" };
    let message = "";
    try {
      parseEnv(bad);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("RESEND_API_KEY");
    expect(message).toContain("UNSUBSCRIBE_SECRET");
    expect(message).not.toContain("not-a-url-secret-xyz");
  });

  it("does not report valid keys", () => {
    expect(() => parseEnv({ ...env, RESEND_API_KEY: undefined })).toThrow(/RESEND_API_KEY$/);
  });
});
