import { acceptedUnsubscribeSecrets, airportById, applyWatchlistOp, isMonitoredId, verifyUnsubscribe, WATCHLIST_CAP, type MonitoredId } from "@aerobrief/core";
import { SubscriptionLimitError, createDb, createRepositories } from "@aerobrief/db";
import { z } from "zod";
import type { Env } from "../env";
import { ApiError, jsonResponse } from "../http";
import { SESSION_COOKIE, type Handler, type Session } from "../router";

/**
 * Watchlist, account and unsubscribe handlers (Requirements 8.1-8.7, 8.9, 8.10, 9.8).
 * Auth, Origin and JSON checks are done by the router; handlers only do endpoint logic.
 */

/** The slice of the repositories these handlers use. */
export interface WatchlistRepos {
  subscriptions: {
    list(userId: string): PromiseLike<readonly { airportId: string }[]>;
    /** Resolves false when already present. Rejects with SubscriptionLimitError at the cap. */
    add(userId: string, airportId: string, now: Date): Promise<boolean>;
    remove(userId: string, airportId: string): Promise<void>;
  };
  users: {
    /** One cascading delete. Resolves true when a user row was deleted. */
    deleteAccount(userId: string): Promise<boolean>;
  };
}

export interface WatchlistDeps {
  /** Builds repositories for a request. Defaults to Drizzle over `env.DATABASE_URL`. */
  repos?: (env: Env) => WatchlistRepos;
}

export interface WatchlistHandlers {
  getWatchlist: Handler;
  addToWatchlist: Handler;
  removeFromWatchlist: Handler;
  deleteAccount: Handler;
  unsubscribe: Handler;
}

export type WatchlistResponse = { watchlist: string[] };

const addBodySchema = z.object({ airportId: z.string() });
const unsubscribeBodySchema = z.object({
  userId: z.string().min(1),
  airportId: z.string().min(1),
  sig: z.string().min(1),
});

function defaultRepos(env: Env): WatchlistRepos {
  const repos = createRepositories(createDb(env.DATABASE_URL));
  return { subscriptions: repos.subscriptions, users: repos.users };
}

function requireSession(session: Session | null): Session {
  if (session === null) throw new ApiError(401, "unauthorized", "Sign in to continue.");
  return session;
}

function watchlistBody(ids: readonly string[]): Response {
  const body: WatchlistResponse = { watchlist: [...ids] };
  return jsonResponse(200, body);
}

function monitoredOnly(rows: readonly { airportId: string }[]): MonitoredId[] {
  const out: MonitoredId[] = [];
  for (const row of rows) {
    if (isMonitoredId(row.airportId)) out.push(row.airportId);
  }
  return out;
}

function capError(): ApiError {
  return new ApiError(409, "watchlist_full", `Your Watchlist already has ${WATCHLIST_CAP} airports. Remove one to add another.`);
}

function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export function createWatchlistHandlers(deps: WatchlistDeps = {}): WatchlistHandlers {
  const reposFor = deps.repos ?? defaultRepos;

  const getWatchlist: Handler = async (_req, env, ctx) => {
    const session = requireSession(ctx.session);
    const rows = await reposFor(env).subscriptions.list(session.userId);
    return watchlistBody(monitoredOnly(rows).sort());
  };

  const addToWatchlist: Handler = async (_req, env, ctx) => {
    const session = requireSession(ctx.session);
    const parsed = addBodySchema.safeParse(ctx.body);
    if (!parsed.success) {
      throw new ApiError(400, "invalid_request", "Body must be { airportId } with a string airportId.");
    }
    const repos = reposFor(env);
    const current = monitoredOnly(await repos.subscriptions.list(session.userId));
    const result = applyWatchlistOp(current, { type: "add", airportId: parsed.data.airportId });
    if (!result.ok) {
      if (result.error === "unmonitored") {
        throw new ApiError(400, "unmonitored_airport", "That airport is not monitored by AeroBrief.");
      }
      throw capError();
    }
    if (result.list.length === current.length) {
      // Already present: success without writing (Requirement 8.6).
      return watchlistBody([...current].sort());
    }
    try {
      await repos.subscriptions.add(session.userId, parsed.data.airportId, ctx.now);
    } catch (err) {
      // A concurrent add can pass the count check; the database trigger is the backstop (Requirement 8.8).
      if (err instanceof SubscriptionLimitError) throw capError();
      throw err;
    }
    return watchlistBody([...result.list].sort());
  };

  const removeFromWatchlist: Handler = async (_req, env, ctx) => {
    const session = requireSession(ctx.session);
    const code = ctx.params["code"];
    if (code === undefined || !isMonitoredId(code)) {
      throw new ApiError(404, "not_found", "Unknown airport code.");
    }
    const repos = reposFor(env);
    await repos.subscriptions.remove(session.userId, code);
    const rows = await repos.subscriptions.list(session.userId);
    return watchlistBody(monitoredOnly(rows).sort());
  };

  const deleteAccount: Handler = async (_req, env, ctx) => {
    const session = requireSession(ctx.session);
    await reposFor(env).users.deleteAccount(session.userId);
    return jsonResponse(200, { deleted: true }, { "Set-Cookie": clearSessionCookie() });
  };

  const unsubscribe: Handler = async (_req, env, ctx) => {
    const parsed = unsubscribeBodySchema.safeParse(ctx.body);
    if (!parsed.success) {
      throw new ApiError(400, "invalid_request", "Body must be { userId, airportId, sig }.");
    }
    const { userId, airportId, sig } = parsed.data;
    const secrets = acceptedUnsubscribeSecrets(
      env.UNSUBSCRIBE_SECRET,
      env.UNSUBSCRIBE_SECRET_PREVIOUS,
      env.UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT,
      ctx.now,
    );
    const valid = await verifyUnsubscribe(secrets, userId, airportId, sig);
    if (!valid || !isMonitoredId(airportId)) {
      throw new ApiError(403, "invalid_signature", "This unsubscribe link is not valid.");
    }
    await reposFor(env).subscriptions.remove(userId, airportId);
    return jsonResponse(200, { airportId, airportName: airportById(airportId).name });
  };

  return { getWatchlist, addToWatchlist, removeFromWatchlist, deleteAccount, unsubscribe };
}
