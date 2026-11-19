import { describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../src/http";
import { routes } from "../src/routes";
import { routesPhase2 } from "../src/routes-phase2";
import { createFetchHandler, unknownRouteResponse, type Phase2Route } from "../src/router";

const ORIGIN = "https://app.example.com";
const baseEnv = {
  DATABASE_URL: "postgresql://user:dbpass_secret@host.neon.tech/db?sslmode=require",
  RESEND_API_KEY: "re_secret_value",
  UNSUBSCRIBE_SECRET: "unsub_secret_value",
  FRONTEND_URL: ORIGIN,
  MAIL_FROM: "AeroBrief <alerts@example.com>",
};
const on = { ...baseEnv, FEATURE_DARK_MODE: "true" };

async function snapshot(res: Response) {
  return { status: res.status, headers: [...res.headers.entries()].sort(), body: await res.text() };
}

describe("Phase 2 fall-through", () => {
  const handler = createFetchHandler(routes);

  it("flags off: /api/features is byte-equal to an unknown path", async () => {
    const features = await snapshot(await handler(new Request("https://x.test/api/features"), baseEnv));
    const unknown = await snapshot(await handler(new Request("https://x.test/api/nope"), baseEnv));
    expect(features).toEqual(unknown);
    expect(features).toEqual(await snapshot(unknownRouteResponse()));
  });

  it("flags off: other methods on /api/features also match an unknown path (no 405, no Origin check)", async () => {
    for (const method of ["POST", "DELETE"]) {
      const a = await snapshot(await handler(new Request("https://x.test/api/features", { method }), baseEnv));
      const b = await snapshot(await handler(new Request("https://x.test/api/nope", { method }), baseEnv));
      expect(a).toEqual(b);
    }
  });

  it("flags on: non-GET to /api/features is 405 with Allow: GET, like other known paths", async () => {
    const res = await handler(new Request("https://x.test/api/features", { method: "POST" }), on);
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET");
  });

  it("existing routes win and are unaffected by flags", async () => {
    const res = await handler(new Request("https://x.test/api/watchlist", { method: "PUT" }), on);
    expect(res.status).toBe(405);
  });

  it("routes.ts table does not contain Phase 2 paths", () => {
    expect(routes.some((r) => r.pattern === "/api/features")).toBe(false);
    expect(routesPhase2.map((r) => `${r.method} ${r.pattern}`)).toEqual([
      "GET /api/features",
      "GET /api/webhooks",
      "POST /api/webhooks",
      "DELETE /api/webhooks/:id",
      "POST /api/webhooks/:id/reenable",
      "POST /api/webhooks/:id/test",
    ]);
  });

  it("runs an enabled injected Phase 2 route with flags on the context, not parseEnv", async () => {
    const spy = vi.fn(async (_req: Request, _env: unknown, ctx: { flags?: unknown }) =>
      jsonResponse(200, { flags: ctx.flags }),
    );
    const table: Phase2Route[] = [
      { method: "GET", pattern: "/api/p2", auth: "none", enabled: (f) => f.FEATURE_DIGESTS, handler: spy as never },
    ];
    const h = createFetchHandler(routes, { phase2Routes: table });
    expect((await h(new Request("https://x.test/api/p2"), baseEnv)).status).toBe(404);
    const res = await h(new Request("https://x.test/api/p2"), { ...baseEnv, FEATURE_DIGESTS: "true" });
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledOnce();
  });
});
