import { createDb, createRepositories } from "@aerobrief/db";
import type { Env } from "./env";
import { logoutHandler, magicLinkHandler, redeemHandler } from "./handlers/auth";
import { createStatusHandlers, type StatusDeps } from "./handlers/status";
import { createWatchlistHandlers } from "./handlers/watchlist";
import type { Handler, Route } from "./router";

/** Read-only repositories for the status handlers, built per request from `env.DATABASE_URL`. */
function statusDepsFor(env: Env): StatusDeps {
  const repos = createRepositories(createDb(env.DATABASE_URL));
  return {
    latestSnapshot: (now) => repos.snapshots.latestSnapshot(now),
    recentEvents: (now, airportId) => repos.events.recentEvents(now, airportId),
  };
}

type StatusKey = "health" | "national" | "airport" | "history";

/** Binds a status handler to the request's env, because `StatusDeps` has no env parameter. */
function statusHandler(key: StatusKey): Handler {
  return (req, env, ctx) => createStatusHandlers(statusDepsFor(env))[key](req, env, ctx);
}

const watchlist = createWatchlistHandlers();

/**
 * The single route table. Method and path match the endpoint table in design.md (apps/api).
 * Vercel keeps the `/api` prefix, so every path starts with it.
 */
export const routes: readonly Route[] = [
  { method: "GET", pattern: "/api/health", auth: "none", handler: statusHandler("health") },
  { method: "GET", pattern: "/api/status/national", auth: "none", handler: statusHandler("national") },
  { method: "GET", pattern: "/api/status/airport/:code", auth: "none", handler: statusHandler("airport") },
  { method: "GET", pattern: "/api/history/:code", auth: "none", handler: statusHandler("history") },
  { method: "POST", pattern: "/api/auth/magic-link", auth: "none", handler: magicLinkHandler },
  { method: "POST", pattern: "/api/auth/redeem", auth: "none", handler: redeemHandler },
  { method: "POST", pattern: "/api/auth/logout", auth: "session", handler: logoutHandler },
  { method: "GET", pattern: "/api/watchlist", auth: "session", handler: watchlist.getWatchlist },
  { method: "POST", pattern: "/api/watchlist", auth: "session", handler: watchlist.addToWatchlist },
  { method: "DELETE", pattern: "/api/watchlist/:code", auth: "session", handler: watchlist.removeFromWatchlist },
  { method: "DELETE", pattern: "/api/account", auth: "session", handler: watchlist.deleteAccount },
  { method: "POST", pattern: "/api/unsubscribe", auth: "signature", handler: watchlist.unsubscribe },
];
