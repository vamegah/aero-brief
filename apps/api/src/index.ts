import { createDb, createRepositories } from "@aerobrief/db";
import { parseEnv } from "./env";
import { createFetchHandler, type FetchHandler, type Session } from "./router";
import { routes } from "./routes";

/**
 * One fetch handler per Worker env object. `resolveSession` has no env parameter, so it is
 * built with the env in scope. The router has already validated the env before it calls
 * `resolveSession`, so `parseEnv` cannot throw here.
 */
function buildHandler(rawEnv: unknown): FetchHandler {
  return createFetchHandler(routes, {
    resolveSession: async (tokenHash, now, signal): Promise<Session | null> => {
      signal.throwIfAborted();
      const env = parseEnv(rawEnv);
      // tokenHash is the SHA-256 hex of the cookie token, the same form auth.ts stores.
      const row = await createRepositories(createDb(env.DATABASE_URL)).sessions.findValid(tokenHash, now);
      if (row === null) return null;
      return { sessionId: row.sessionId, userId: row.userId, email: row.email, tokenHash };
    },
  });
}

const handlers = new WeakMap<object, FetchHandler>();

export default {
  fetch(request: Request, env: unknown): Promise<Response> {
    if (typeof env !== "object" || env === null) return buildHandler(env)(request, env);
    let handler = handlers.get(env);
    if (handler === undefined) {
      handler = buildHandler(env);
      handlers.set(env, handler);
    }
    return handler(request, env);
  },
};
