import { acceptedUnsubscribeSecrets, verifyDigestUnsubscribe } from "@aerobrief/core";
import { createDb, createRepositories } from "@aerobrief/db";
import { z } from "zod";
import type { Env } from "../env";
import { ApiError, jsonResponse } from "../http";
import type { Handler, Session } from "../router";

/**
 * Digest preference and unsubscribe handlers (Requirements 10.2 to 10.5, 12.3 to 12.6).
 * Auth, Origin and JSON checks are done by the router. The routes exist only while the digests
 * flag is on; the Phase 2 table makes them 404 otherwise.
 */

export interface DigestPreference {
  enabled: boolean;
  hour: number;
}

export interface DigestRepos {
  digest: {
    getPreference(userId: string): Promise<DigestPreference | undefined>;
    upsertPreference(
      input: { userId: string; enabled: boolean; hour: number },
      now: Date,
    ): Promise<DigestPreference | undefined>;
    /** Idempotent. Resolves false when the user has no row. */
    disable(userId: string, now: Date): Promise<boolean>;
  };
}

export interface DigestDeps {
  /** Builds repositories for a request. Defaults to Drizzle over `env.DATABASE_URL`. */
  repos?: (env: Env) => DigestRepos;
}

export interface DigestHandlers {
  getDigest: Handler;
  putDigest: Handler;
  unsubscribeDigest: Handler;
}

/** `hour` is an integer 0 to 23. Its time zone is applied by the poller, not here. */
export const digestPreferenceSchema = z.strictObject({
  enabled: z.boolean(),
  hour: z.number().int().min(0).max(23),
});

const unsubscribeBodySchema = z.strictObject({
  userId: z.uuid(),
  sig: z.string().min(1),
});

export const DEFAULT_DIGEST_PREFERENCE: DigestPreference = { enabled: false, hour: 7 };

function defaultRepos(env: Env): DigestRepos {
  return { digest: createRepositories(createDb(env.DATABASE_URL)).digest };
}

function requireSession(session: Session | null): Session {
  if (session === null) throw new ApiError(401, "unauthorized", "Sign in to continue.");
  return session;
}

export function createDigestHandlers(deps: DigestDeps = {}): DigestHandlers {
  const reposFor = deps.repos ?? defaultRepos;

  const getDigest: Handler = async (_req, env, ctx) => {
    const session = requireSession(ctx.session);
    const row = await reposFor(env).digest.getPreference(session.userId);
    const pref = row === undefined ? DEFAULT_DIGEST_PREFERENCE : { enabled: row.enabled, hour: row.hour };
    return jsonResponse(200, pref, { "Cache-Control": "no-store" });
  };

  const putDigest: Handler = async (_req, env, ctx) => {
    const session = requireSession(ctx.session);
    const parsed = digestPreferenceSchema.safeParse(ctx.body);
    if (!parsed.success) {
      throw new ApiError(400, "invalid_request", "Body must be { enabled: boolean, hour: integer 0 to 23 }.");
    }
    const saved = await reposFor(env).digest.upsertPreference({ userId: session.userId, ...parsed.data }, ctx.now);
    const pref = saved ?? parsed.data;
    return jsonResponse(200, { enabled: pref.enabled, hour: pref.hour }, { "Cache-Control": "no-store" });
  };

  /** No session: the signed link is the credential. Idempotent, and 200 even when no row exists. */
  const unsubscribeDigest: Handler = async (_req, env, ctx) => {
    const parsed = unsubscribeBodySchema.safeParse(ctx.body);
    if (!parsed.success) {
      throw new ApiError(400, "invalid_request", "Body must be { userId, sig }.");
    }
    const { userId, sig } = parsed.data;
    const secrets = acceptedUnsubscribeSecrets(
      env.UNSUBSCRIBE_SECRET,
      env.UNSUBSCRIBE_SECRET_PREVIOUS,
      env.UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT,
      ctx.now,
    );
    if (!(await verifyDigestUnsubscribe(userId, sig, secrets))) {
      throw new ApiError(403, "invalid_signature", "This unsubscribe link is not valid.");
    }
    await reposFor(env).digest.disable(userId, ctx.now);
    return jsonResponse(200, { enabled: false }, { "Cache-Control": "no-store" });
  };

  return { getDigest, putDigest, unsubscribeDigest };
}
