import { createLogger } from "@aerobrief/core";
import { runCleanup } from "./cleanup";
import type { Env } from "./env";
import { runPoll } from "./poll";

export const POLL_CRON = "*/5 * * * *";
export const CLEANUP_CRON = "*/30 * * * *";

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
      default:
        createLogger([env.DATABASE_URL, env.RESEND_API_KEY, env.UNSUBSCRIBE_SECRET]).warn(
          "unknown cron trigger",
          { cron: controller.cron },
        );
    }
  },
} satisfies ExportedHandler<Env>;
