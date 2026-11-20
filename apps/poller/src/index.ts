import { createLogger } from "@aerobrief/core";
import { runCleanup } from "./cleanup";
import { CLEANUP_CRON, DIGEST_CRON, POLL_CRON } from "./crons";
import { runDigest } from "./digest";
import type { Env } from "./env";
import { runPoll } from "./poll";

export default {
  // The runtime awaits this promise, so ctx.waitUntil is not needed for a single task.
  async scheduled(controller, env, _ctx) {
    const now = new Date(controller.scheduledTime);
    switch (controller.cron) {
      case POLL_CRON:
        await runPoll(env, now);
        return;
      case CLEANUP_CRON:
        await runCleanup(env, now);
        return;
      case DIGEST_CRON:
        // runDigest returns at once when the digests flag is off and never throws; the catch is a backstop.
        try {
          await runDigest(env, now);
        } catch (err) {
          createLogger([env.DATABASE_URL, env.RESEND_API_KEY, env.UNSUBSCRIBE_SECRET]).error(
            "digest cron failed",
            { errorName: err instanceof Error ? err.name : "unknown" },
          );
        }
        return;
      default:
        createLogger([env.DATABASE_URL, env.RESEND_API_KEY, env.UNSUBSCRIBE_SECRET]).warn(
          "unknown cron trigger",
          { cron: controller.cron },
        );
    }
  },
} satisfies ExportedHandler<Env>;
