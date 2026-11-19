// Flags-off guard. With every Phase 2 flag off, the app must behave exactly as `main`.
// Validates Requirements 2.2, 2.4, 3.1, 3.2, 3.3.
//
// Later sections extend `PHASE2_DISABLED_PATHS` with their own routes, so each disabled route
// is checked against a truly unknown path.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseEnv } from "../apps/api/src/env";
import { createFetchHandler } from "../apps/api/src/router";
import { routes } from "../apps/api/src/routes";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Baseline hashes of the two frozen design files. The baseline is `main` at HEAD
 * (`git show main:<path>`), because the guard's purpose is "Phase 2 never edits these files".
 * The tag `mvp-contest-2026` is not the baseline: `main` moved past it, and the spec says to
 * guard what `main` holds. (At the time of writing both files are byte-identical on `main` and
 * on the tag, so the values are the same either way.)
 *
 * The hash is SHA-256 of the UTF-8 text with CRLF normalized to LF, so a Windows checkout with
 * CRLF and the Linux CI checkout produce the same value. Computed once with:
 *   git show main:apps/web/src/styles/<file>  ->  replace \r\n with \n  ->  sha256 hex
 * If a Phase 2 change legitimately needs these files, that is a spec change, not a hash update.
 */
const FROZEN_FILES: ReadonlyArray<{ path: string; sha256: string }> = [
  {
    path: "apps/web/src/styles/tokens.css",
    sha256: "34a8b6e96e560f10b2fd9161b1e0123409aea069b87b028640c42ff325adb51e",
  },
  {
    path: "apps/web/src/styles/palette.ts",
    sha256: "1944bb94988ac9541749cc403b754a30564b1c28e15c900e221b831d5606e345",
  },
];

async function sha256Lf(path: string): Promise<string> {
  const text = readFileSync(resolve(ROOT, path), "utf8").replace(/\r\n/g, "\n");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The `routes` table as shipped on `main`: method and pattern, in order. */
const MAIN_ROUTE_KEYS = [
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

/** Phase 2 paths that must be indistinguishable from an unknown path while their flags are off. */
const PHASE2_DISABLED_PATHS = ["/api/features"];

const WEBHOOK_ID = "123e4567-e89b-42d3-a456-426614174000";
/** Webhook routes (Task 4.33). `/test` is added by Task 4.31; with flags off it must 404 either way. */
const WEBHOOK_DISABLED_ROUTES: ReadonlyArray<{ method: string; path: string }> = [
  { method: "GET", path: "/api/webhooks" },
  { method: "POST", path: "/api/webhooks" },
  { method: "DELETE", path: `/api/webhooks/${WEBHOOK_ID}` },
  { method: "POST", path: `/api/webhooks/${WEBHOOK_ID}/reenable` },
  { method: "POST", path: `/api/webhooks/${WEBHOOK_ID}/test` },
];

/** Digest routes (Task 5.18). With FEATURE_DIGESTS off they must 404 like an unknown path. */
const DIGEST_DISABLED_ROUTES: ReadonlyArray<{ method: string; path: string; unknownPath: string }> = [
  { method: "GET", path: "/api/digest", unknownPath: "/api/no-such-route" },
  { method: "PUT", path: "/api/digest", unknownPath: "/api/no-such-route" },
  { method: "POST", path: "/api/digest/unsubscribe", unknownPath: "/api/no-such-route/sub" },
];

const baseEnv = {
  DATABASE_URL: "postgresql://user:pw@host.neon.tech/db",
  RESEND_API_KEY: "re_secret",
  UNSUBSCRIBE_SECRET: "sig_secret",
  FRONTEND_URL: "https://app.example.com",
  MAIL_FROM: "AeroBrief <alerts@example.com>",
};

const FLAG_NAMES = ["FEATURE_DARK_MODE", "FEATURE_HIGH_CONTRAST", "FEATURE_DIGESTS", "FEATURE_WEBHOOKS"];
const flagsFalse = Object.fromEntries(FLAG_NAMES.map((n) => [n, "false"]));
const flagsInvalid = Object.fromEntries(FLAG_NAMES.map((n) => [n, "yes"]));

async function snapshot(res: Response) {
  return { status: res.status, headers: [...res.headers.entries()].sort(), body: await res.text() };
}

describe("flags-off guard: frozen design files", () => {
  for (const { path, sha256 } of FROZEN_FILES) {
    it(`${path} is unchanged from main`, async () => {
      expect(await sha256Lf(path)).toBe(sha256);
    });
  }
});

describe("flags-off guard: API", () => {
  it("parseEnv output is unchanged for a sample env and ignores flag names", () => {
    const expected = {
      ...baseEnv,
      UNSUBSCRIBE_SECRET_PREVIOUS: undefined,
      UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT: undefined,
    };
    expect(parseEnv(baseEnv)).toEqual(expected);
    expect(parseEnv({ ...baseEnv, ...flagsFalse })).toEqual(expected);
    expect(parseEnv({ ...baseEnv, FEATURE_WEBHOOKS: "true" })).toEqual(expected);
  });

  it("the routes table keys equal the stored list", () => {
    expect(routes.map((r) => `${r.method} ${r.pattern}`)).toEqual(MAIN_ROUTE_KEYS);
  });

  const envs: Array<[string, Record<string, string>]> = [
    ["default env (no flags set)", baseEnv],
    ["every flag set to false", { ...baseEnv, ...flagsFalse }],
    ["every flag invalid (treated as off)", { ...baseEnv, ...flagsInvalid }],
  ];
  for (const [label, env] of envs) {
    for (const path of PHASE2_DISABLED_PATHS) {
      it(`${path} matches a truly unknown path: ${label}`, async () => {
        const handler = createFetchHandler(routes);
        const disabled = await snapshot(await handler(new Request(`https://x.test${path}`), env));
        const unknown = await snapshot(await handler(new Request("https://x.test/api/no-such-route"), env));
        expect(disabled.status).toBe(404);
        expect(disabled).toEqual(unknown);
      });
    }

    for (const { method, path } of WEBHOOK_DISABLED_ROUTES) {
      const unknownPath = path.replace("/api/webhooks", "/api/no-such-route");
      const hasBody = method === "POST";
      // Once as a real client sends it, once bare, so other checks cannot be the cause of the 404.
      const variants: Array<[string, () => RequestInit]> = [
        [
          "with Origin and JSON",
          () => ({
            method,
            headers: { Origin: "https://app.example.com", "Content-Type": "application/json" },
            ...(hasBody ? { body: "{}" } : {}),
          }),
        ],
        ["without Origin or content-type", () => ({ method })],
      ];
      for (const [variant, init] of variants) {
        it(`${method} ${path} (${variant}) matches an unknown path: ${label}`, async () => {
          const handler = createFetchHandler(routes);
          const disabled = await snapshot(await handler(new Request(`https://x.test${path}`, init()), env));
          const unknown = await snapshot(await handler(new Request(`https://x.test${unknownPath}`, init()), env));
          expect(disabled.status).toBe(404);
          expect(disabled).toEqual(unknown);
        });
      }
    }
  }
});
