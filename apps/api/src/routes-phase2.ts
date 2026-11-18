import { anyFlagOn, featuresHandler } from "./features";
import type { Phase2Route } from "./router";

/**
 * The Phase 2 route table, separate from `routes`. The router tries it only after `routes`
 * finds no match, and only the entries whose `enabled` check passes take part in matching.
 * A disabled entry therefore behaves exactly like an unknown path (same 404, including for
 * other methods), never like a known path with the wrong method.
 */
export const routesPhase2: readonly Phase2Route[] = [
  { method: "GET", pattern: "/api/features", auth: "none", enabled: anyFlagOn, handler: featuresHandler },
];
