import { createLogger, type LogSink, type Logger } from "@aerobrief/core";
import { parseEnv, type Env } from "./env";
import { ApiError, errorResponse } from "./http";

/** Hand-written router on the Workers fetch handler. No routing framework (design.md, apps/api). */

export const SESSION_COOKIE = "aerobrief_session";
export const QUERY_TIMEOUT_MS = 5_000;
export const RETRY_AFTER_SECONDS = 30;
const MAX_BODY_CHARS = 16_384;

export interface Session {
  sessionId: string;
  userId: string;
  email: string;
  /** SHA-256 hex of the cookie token, as stored in `sessions.token_hash`. */
  tokenHash: string;
}

export interface RouteContext {
  /** Decoded path params, for example `{ code: "JFK" }`. */
  params: Readonly<Record<string, string>>;
  /** Resolved Session. Non-null for `auth: "session"` routes, always null otherwise. */
  session: Session | null;
  now: Date;
  /** Parsed JSON body of a mutating request, or `undefined` when the request has no body. */
  body: unknown;
  url: URL;
  /** Aborted when the 5 s request budget runs out. Pass it to database calls. */
  signal: AbortSignal;
  logger: Logger;
}

export type Handler = (req: Request, env: Env, ctx: RouteContext) => Promise<Response>;

export type Route = {
  method: "GET" | "POST" | "DELETE";
  pattern: string;
  auth: "none" | "session" | "signature";
  handler: Handler;
};

export interface RouterDeps {
  now?: () => Date;
  /** Looks up an unexpired Session by token hash. Defaults to "no session" (fail closed). */
  resolveSession?: (tokenHash: string, now: Date, signal: AbortSignal) => Promise<Session | null>;
  /** Request budget in ms (default 5000, Requirement 12.6). */
  timeoutMs?: number;
  /** Log destination (default console). */
  logSink?: LogSink;
}

export type FetchHandler = (request: Request, rawEnv: unknown) => Promise<Response>;

class DeadlineError extends Error {
  constructor() {
    super("request deadline exceeded");
    this.name = "DeadlineError";
  }
}

/** SHA-256 hex of a string, using Web Crypto. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function splitPath(path: string): string[] {
  return path.split("/").filter((s) => s.length > 0);
}

/** Returns decoded params when `path` matches `pattern`, otherwise null. */
export function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const want = splitPath(pattern);
  const got = splitPath(path);
  if (want.length !== got.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    const w = want[i];
    const g = got[i];
    if (w === undefined || g === undefined) return null;
    if (w.startsWith(":")) {
      try {
        params[w.slice(1)] = decodeURIComponent(g);
      } catch {
        return null;
      }
    } else if (w !== g) {
      return null;
    }
  }
  return params;
}

function readCookie(header: string | null, name: string): string | null {
  if (header === null) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      const value = part.slice(eq + 1).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

function isJsonContentType(header: string | null): boolean {
  if (header === null) return false;
  return (header.split(";")[0] ?? "").trim().toLowerCase() === "application/json";
}

async function runWithDeadline<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new DeadlineError());
    }, ms);
  });
  try {
    return await Promise.race([fn(controller.signal), deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function unavailable(): Response {
  return errorResponse(503, "service_unavailable", "The service is temporarily unavailable. Try again shortly.", {
    "Retry-After": String(RETRY_AFTER_SECONDS),
  });
}

type BodyResult = { ok: true; body: unknown } | { ok: false; response: Response };

/**
 * JSON checks for mutating requests. Body presence is decided by content, not by `req.body`,
 * because proxies (the Vercel rewrite) hand bodiless DELETEs through with an empty, non-null body.
 * POST and any request with a non-empty body must send Content-Type: application/json.
 */
async function readBody(req: Request): Promise<BodyResult> {
  const tooLarge = (): BodyResult => ({
    ok: false,
    response: errorResponse(413, "payload_too_large", "The request body is too large."),
  });
  let text = "";
  if (req.body !== null) {
    // A UTF-8 char is at most 4 bytes, so a larger Content-Length can never fit the char limit.
    const declared = Number(req.headers.get("Content-Length"));
    if (Number.isFinite(declared) && declared > MAX_BODY_CHARS * 4) return tooLarge();
    text = await req.text();
    if (text.length > MAX_BODY_CHARS) return tooLarge();
  }
  const hasContent = text.trim().length > 0;
  if (req.method === "POST" || hasContent) {
    if (!isJsonContentType(req.headers.get("Content-Type"))) {
      return {
        ok: false,
        response: errorResponse(415, "unsupported_media_type", "Content-Type must be application/json."),
      };
    }
  }
  if (!hasContent) return { ok: true, body: undefined };
  try {
    return { ok: true, body: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, response: errorResponse(400, "invalid_json", "The request body is not valid JSON.") };
  }
}

export function createFetchHandler(routes: readonly Route[], deps: RouterDeps = {}): FetchHandler {
  const clock = deps.now ?? ((): Date => new Date());
  const timeoutMs = deps.timeoutMs ?? QUERY_TIMEOUT_MS;
  const resolveSession =
    deps.resolveSession ??
    ((): Promise<Session | null> => Promise.resolve(null));
  const envCache = new WeakMap<object, Env>();
  const bootLogger = createLogger([], deps.logSink);

  function getEnv(rawEnv: unknown): Env | null {
    if (typeof rawEnv === "object" && rawEnv !== null) {
      const cached = envCache.get(rawEnv);
      if (cached) return cached;
    }
    try {
      const env = parseEnv(rawEnv);
      if (typeof rawEnv === "object" && rawEnv !== null) envCache.set(rawEnv, env);
      return env;
    } catch (err) {
      // parseEnv names only the offending keys, never values.
      bootLogger.error("invalid_env", { reason: err instanceof Error ? err.message : "unknown" });
      return null;
    }
  }

  return async (request, rawEnv) => {
    const env = getEnv(rawEnv);
    if (env === null) {
      return errorResponse(500, "internal_error", "The server is not configured correctly.");
    }
    const logger = createLogger([env.DATABASE_URL, env.RESEND_API_KEY, env.UNSUBSCRIBE_SECRET], deps.logSink);

    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    let route: Route | undefined;
    let params: Record<string, string> = {};
    const allowed = new Set<string>();
    for (const r of routes) {
      const m = matchPattern(r.pattern, url.pathname);
      if (m === null) continue;
      allowed.add(r.method);
      if (r.method === method && route === undefined) {
        route = r;
        params = m;
      }
    }
    if (route === undefined) {
      if (allowed.size > 0) {
        return errorResponse(405, "method_not_allowed", "Method not allowed.", {
          Allow: [...allowed].sort().join(", "),
        });
      }
      return errorResponse(404, "not_found", "Not found.");
    }

    const mutating = method !== "GET";
    let body: unknown = undefined;
    if (mutating) {
      // Origin must match the frontend, which together with SameSite=Lax covers CSRF.
      if (request.headers.get("Origin") !== new URL(env.FRONTEND_URL).origin) {
        return errorResponse(403, "forbidden_origin", "Request origin is not allowed.");
      }
      const parsed = await readBody(request);
      if (!parsed.ok) return parsed.response;
      body = parsed.body;
    }

    const matched = route;
    const now = clock();
    try {
      return await runWithDeadline(timeoutMs, async (signal) => {
        let session: Session | null = null;
        if (matched.auth === "session") {
          const token = readCookie(request.headers.get("Cookie"), SESSION_COOKIE);
          if (token === null) return unauthorized();
          session = await resolveSession(await sha256Hex(token), now, signal);
          if (session === null) return unauthorized();
        }
        const ctx: RouteContext = { params, session, now, body, url, signal, logger };
        return matched.handler(request, env, ctx);
      });
    } catch (err) {
      if (err instanceof ApiError) {
        return errorResponse(err.status, err.code, err.message, { ...err.headers });
      }
      // Anything else is a dependency failure (database error or timeout): 503, no retry detail leaked.
      logger.error(err instanceof DeadlineError ? "request_timeout" : "request_failed", {
        method,
        pattern: matched.pattern,
        error: err,
      });
      return unavailable();
    }
  };
}

function unauthorized(): Response {
  return errorResponse(401, "unauthorized", "Sign in to continue.");
}
