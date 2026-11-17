import { describe, expect, it } from "vitest";
import { routes } from "../src/routes";

/** The endpoint table in design.md (apps/api), in document order. */
const DOCUMENTED = [
  "GET /api/health",
  "GET /api/status/national",
  "GET /api/status/airport/:code",
  "GET /api/history/:code",
  "POST /api/auth/magic-link",
  "POST /api/auth/redeem",
  "POST /api/auth/logout",
  "GET /api/watchlist",
  "POST /api/watchlist",
  "DELETE /api/watchlist/:code",
  "DELETE /api/account",
  "POST /api/unsubscribe",
];

describe("route table", () => {
  it("matches the documented endpoints exactly", () => {
    expect(routes.map((r) => `${r.method} ${r.pattern}`)).toEqual(DOCUMENTED);
  });

  it("requires a session for watchlist, account and logout routes", () => {
    const sessionRoutes = routes.filter((r) => r.auth === "session").map((r) => `${r.method} ${r.pattern}`);
    expect(sessionRoutes).toEqual([
      "POST /api/auth/logout",
      "GET /api/watchlist",
      "POST /api/watchlist",
      "DELETE /api/watchlist/:code",
      "DELETE /api/account",
    ]);
  });

  it("uses signature auth only for unsubscribe", () => {
    const sig = routes.filter((r) => r.auth === "signature").map((r) => `${r.method} ${r.pattern}`);
    expect(sig).toEqual(["POST /api/unsubscribe"]);
  });
});
