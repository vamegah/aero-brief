// Flags-off guard for the digest in the Poller. With FEATURE_DIGESTS unset, "false" or invalid,
// runDigest must return before any repository, Resend or other outbound call.
// Validates Requirements 1.5, 3.1, 3.2.
import { createLogger } from "@aerobrief/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runDigest, type DigestRepositories } from "../src/digest";
import type { Env } from "../src/env";

const baseEnv: Env = {
  DATABASE_URL: "postgresql://user:pass@host.neon.tech/db",
  RESEND_API_KEY: "re_secret_value",
  UNSUBSCRIBE_SECRET: "unsub_secret_value",
  FRONTEND_URL: "https://aerobrief.example.com",
  MAIL_FROM: "AeroBrief <alerts@example.com>",
};

const now = new Date("2025-01-02T12:00:00.000Z");

const cases: Array<[string, Partial<Env>]> = [
  ["unset", {}],
  ['"false"', { FEATURE_DIGESTS: "false" }],
  ["invalid", { FEATURE_DIGESTS: "yes" }],
  ["invalid with webhooks on", { FEATURE_DIGESTS: "TRUE ", FEATURE_WEBHOOKS: "true" }],
];

describe("runDigest with FEATURE_DIGESTS off", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  for (const [label, flags] of cases) {
    it(`makes no repository, Resend or fetch call: ${label}`, async () => {
      const createRepositories = vi.fn((_url: string): DigestRepositories => {
        throw new Error("repositories must not be created");
      });
      const resendFetch = vi.fn(async (_url: string, _init: RequestInit) => new Response("{}"));
      const globalFetch = vi.fn(async () => new Response("{}"));
      vi.stubGlobal("fetch", globalFetch);
      const logger = createLogger([]);

      const summary = await runDigest({ ...baseEnv, ...flags }, now, {
        createRepositories,
        fetchFn: resendFetch,
        sleep: async () => undefined,
        clock: () => now,
        logger,
      });

      expect(summary.skippedReason).toBe("flag_off");
      expect(summary).toEqual({
        skippedReason: "flag_off",
        due: 0,
        claimed: 0,
        handedOff: 0,
        failed: 0,
        skipped: 0,
        errored: 0,
      });
      expect(createRepositories).not.toHaveBeenCalled();
      expect(resendFetch).not.toHaveBeenCalled();
      expect(globalFetch).not.toHaveBeenCalled();
    });
  }
});
