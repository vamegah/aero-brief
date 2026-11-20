// Kept out of index.ts: workerd treats every named export of the main module as an entrypoint.
export const POLL_CRON = "*/5 * * * *";
export const CLEANUP_CRON = "*/30 * * * *";
/** Hourly digest run. Must match apps/poller/wrangler.jsonc character for character. */
export const DIGEST_CRON = "0 * * * *";
