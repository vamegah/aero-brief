import { isRateLimited, validateEmail } from "@aerobrief/core";
import { createDb, createRepositories, type Repositories } from "@aerobrief/db";
import { sendEmail, type SendEmailOptions, type SendEmailResult } from "@aerobrief/mail";
import { z } from "zod";
import type { Env } from "../env";
import { ApiError, jsonResponse } from "../http";
import { SESSION_COOKIE, sha256Hex, type Handler } from "../router";

export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;
const RATE_LIMIT_RETRY_AFTER_SECONDS = 3600;

/** The repository methods the auth handlers use. A subset of `Repositories`. */
export interface AuthRepos {
  users: Pick<Repositories["users"], "upsertByEmail">;
  sessions: Pick<Repositories["sessions"], "create" | "delete">;
  magicLinks: Pick<Repositories["magicLinks"], "create" | "redeem" | "invalidate" | "countRecent">;
}

export interface AuthDeps {
  repos: (env: Env) => AuthRepos;
  send: (opts: SendEmailOptions) => Promise<SendEmailResult>;
  /** A fresh token: 32 random bytes, base64url. */
  newToken: () => string;
}

/** 32 random bytes from `crypto.getRandomValues`, base64url without padding. */
export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const defaultDeps: AuthDeps = {
  repos: (env) => createRepositories(createDb(env.DATABASE_URL)),
  send: sendEmail,
  newToken: generateToken,
};

const magicLinkBodySchema = z.object({ email: z.string() });
const redeemBodySchema = z.object({ token: z.string().min(1).max(256) });

function invalidBody(message: string): ApiError {
  return new ApiError(400, "validation_error", message);
}

function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

/** The link opens a Frontend page that redeems with POST. The token sits in the fragment, so it is not sent to servers or logged in access logs. */
function buildLink(frontendUrl: string, token: string): string {
  const base = new URL("/auth/callback", frontendUrl);
  base.hash = `token=${token}`;
  return base.toString();
}

export function createAuthHandlers(overrides: Partial<AuthDeps> = {}): {
  magicLink: Handler;
  redeem: Handler;
  logout: Handler;
} {
  const deps: AuthDeps = { ...defaultDeps, ...overrides };

  /** POST /api/auth/magic-link (Requirements 7.1, 7.2, 7.5, 7.6, 7.7, 7.8, 7.10). */
  const magicLink: Handler = async (_req, env, ctx) => {
    const parsed = magicLinkBodySchema.safeParse(ctx.body);
    if (!parsed.success) throw invalidBody("Provide an email address.");
    const checked = validateEmail(parsed.data.email);
    if (!checked.ok) throw invalidBody("Enter a valid email address of 254 characters or fewer.");
    const email = checked.email;

    const repos = deps.repos(env);

    // Rows invalidated by a Resend failure still count toward the limit.
    const recent = await repos.magicLinks.countRecent(email, ctx.now);
    if (isRateLimited(Array.from({ length: recent }, () => ctx.now), ctx.now)) {
      throw new ApiError(
        429,
        "rate_limited",
        "Too many sign-in requests for this email. Try again later.",
        { "Retry-After": String(RATE_LIMIT_RETRY_AFTER_SECONDS) },
      );
    }

    const token = deps.newToken();
    const tokenHash = await sha256Hex(token);
    await repos.magicLinks.create({
      email,
      tokenHash,
      createdAt: ctx.now,
      expiresAt: new Date(ctx.now.getTime() + MAGIC_LINK_TTL_MS),
    });

    const link = buildLink(env.FRONTEND_URL, token);
    const result = await deps.send({
      apiKey: env.RESEND_API_KEY,
      message: {
        from: env.MAIL_FROM,
        to: email,
        subject: "Your AeroBrief sign-in link",
        text:
          `Use this link to sign in to AeroBrief. It expires in 15 minutes and works once.\n\n${link}\n\n` +
          "If you did not request it, you can ignore this email.",
      },
      idempotency: { eventKey: tokenHash, eventType: "magic_link", userId: email },
    });

    if (!result.ok) {
      await repos.magicLinks.invalidate(tokenHash, ctx.now);
      // Never log the token, the link, or the email body.
      ctx.logger.warn("magic_link_send_failed", { status: result.status, error: result.error });
      throw new ApiError(502, "email_send_failed", "The sign-in email could not be sent. Try again.");
    }

    return jsonResponse(200, { ok: true });
  };

  /** POST /api/auth/redeem (Requirements 7.3, 7.4). */
  const redeem: Handler = async (_req, env, ctx) => {
    const parsed = redeemBodySchema.safeParse(ctx.body);
    if (!parsed.success) throw invalidBody("Provide a sign-in token.");

    const repos = deps.repos(env);
    const linkHash = await sha256Hex(parsed.data.token);
    const email = await repos.magicLinks.redeem(linkHash, ctx.now);
    if (email === null) {
      throw new ApiError(400, "invalid_link", "This sign-in link is invalid or expired.");
    }

    const user = await repos.users.upsertByEmail(email, ctx.now);
    const sessionToken = deps.newToken();
    await repos.sessions.create({
      userId: user.id,
      tokenHash: await sha256Hex(sessionToken),
      createdAt: ctx.now,
      expiresAt: new Date(ctx.now.getTime() + SESSION_TTL_MS),
    });

    return jsonResponse(200, { email: user.email }, { "Set-Cookie": sessionCookie(sessionToken, SESSION_TTL_SECONDS) });
  };

  /** POST /api/auth/logout (Requirement 7.9). The route is `auth: "session"`. */
  const logout: Handler = async (_req, env, ctx) => {
    if (ctx.session === null) throw new ApiError(401, "unauthorized", "Sign in to continue.");
    await deps.repos(env).sessions.delete(ctx.session.tokenHash);
    return jsonResponse(200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
  };

  return { magicLink, redeem, logout };
}

const handlers = createAuthHandlers();
export const magicLinkHandler: Handler = handlers.magicLink;
export const redeemHandler: Handler = handlers.redeem;
export const logoutHandler: Handler = handlers.logout;
