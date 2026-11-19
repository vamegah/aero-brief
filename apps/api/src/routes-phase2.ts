import type { Flags } from "@aerobrief/core";
import { anyFlagOn, featuresHandler } from "./features";
import { createWebhookHandlers } from "./handlers/webhooks";
import type { Phase2Route } from "./router";

/**
 * The Phase 2 route table, separate from `routes`. The router tries it only after `routes`
 * finds no match, and only the entries whose `enabled` check passes take part in matching.
 * A disabled entry therefore behaves exactly like an unknown path (same 404, including for
 * other methods), never like a known path with the wrong method.
 */
const webhooks = createWebhookHandlers();
const webhooksOn = (f: Flags): boolean => f.FEATURE_WEBHOOKS;

export const routesPhase2: readonly Phase2Route[] = [
  { method: "GET", pattern: "/api/features", auth: "none", enabled: anyFlagOn, handler: featuresHandler },
  { method: "GET", pattern: "/api/webhooks", auth: "session", enabled: webhooksOn, handler: webhooks.listWebhooks },
  { method: "POST", pattern: "/api/webhooks", auth: "session", enabled: webhooksOn, handler: webhooks.createWebhook },
  { method: "DELETE", pattern: "/api/webhooks/:id", auth: "session", enabled: webhooksOn, handler: webhooks.deleteWebhook },
  {
    method: "POST",
    pattern: "/api/webhooks/:id/reenable",
    auth: "session",
    enabled: webhooksOn,
    handler: webhooks.reenableWebhook,
  },
  {
    method: "POST",
    pattern: "/api/webhooks/:id/test",
    auth: "session",
    enabled: webhooksOn,
    handler: webhooks.testWebhook,
  },
];
