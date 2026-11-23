import fc from "fast-check";
import { describe, it } from "vitest";
import {
  RELAY_ALLOWED_HOST,
  RELAY_ALLOWED_PATH,
  RELAY_ERROR_BODY_CHARS,
  RELAY_SECRET_MIN_LENGTH,
  decideRelayRequest,
  resolveRelayConfig,
  shapeRelayResponse,
  timingSafeEqualStrings,
} from "../src/faa-relay";

const RUNS = { numRuns: 200 };
const VALID_URL = `https://${RELAY_ALLOWED_HOST}${RELAY_ALLOWED_PATH}`;

const longSecret = fc.string({ minLength: RELAY_SECRET_MIN_LENGTH, maxLength: 80 });
const anyMethod = fc.oneof(
  fc.constantFrom("GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "get", "Get", ""),
  fc.string({ maxLength: 10 }),
);

/**
 * Feature: faa-403-poller, Property 4: Relay is not an open proxy
 *
 * **Validates: Requirements 2.2**
 */
describe("timingSafeEqualStrings (property)", () => {
  it("agrees with === for any two strings", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => timingSafeEqualStrings(a, b) === (a === b)),
      RUNS,
    );
  });

  it("is true for a string and an equal copy, and false for a strict prefix", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (a) => {
        return timingSafeEqualStrings(a, `${a}`) && !timingSafeEqualStrings(a, a.slice(0, -1));
      }),
      RUNS,
    );
  });
});

/**
 * Feature: faa-403-poller, Property 4: Relay is not an open proxy
 *
 * **Validates: Requirements 2.2**
 */
describe("decideRelayRequest (property)", () => {
  it("returns fetch only for GET with a key equal to a valid secret", () => {
    fc.assert(
      fc.property(
        anyMethod,
        fc.option(fc.string({ maxLength: 80 }), { nil: undefined }),
        fc.option(fc.string({ maxLength: 80 }), { nil: undefined }),
        (method, providedKey, secret) => {
          const decision = decideRelayRequest({ method, providedKey, secret });
          const allowed =
            method === "GET" &&
            typeof secret === "string" &&
            secret.length >= RELAY_SECRET_MIN_LENGTH &&
            providedKey === secret;
          return (decision.action === "fetch") === allowed;
        },
      ),
      RUNS,
    );
  });

  it("fetches for GET with exactly the right key, for any valid secret", () => {
    fc.assert(
      fc.property(longSecret, (secret) => {
        return decideRelayRequest({ method: "GET", providedKey: secret, secret }).action === "fetch";
      }),
      RUNS,
    );
  });

  it("never fetches for a non-GET method, even with the right key", () => {
    fc.assert(
      fc.property(
        anyMethod.filter((m) => m !== "GET"),
        longSecret,
        (method, secret) => decideRelayRequest({ method, providedKey: secret, secret }).action === "reject",
      ),
      RUNS,
    );
  });

  it("never fetches with a missing or wrong key", () => {
    fc.assert(
      fc.property(
        longSecret,
        fc.option(fc.string({ maxLength: 80 }), { nil: null }),
        (secret, key) => {
          fc.pre(key !== secret);
          const decision = decideRelayRequest({ method: "GET", providedKey: key, secret });
          return decision.action === "reject" && decision.status === 401;
        },
      ),
      RUNS,
    );
  });

  it("answers 405 for non-GET and 500 for a short or missing secret, and never echoes secret or key", () => {
    fc.assert(
      fc.property(
        anyMethod,
        fc.string({ maxLength: 80 }),
        fc.option(fc.string({ maxLength: RELAY_SECRET_MIN_LENGTH - 1 }), { nil: undefined }),
        (method, key, shortSecret) => {
          const decision = decideRelayRequest({ method, providedKey: key, secret: shortSecret });
          return decision.action === "reject" && decision.status === 500;
        },
      ),
      RUNS,
    );
    fc.assert(
      fc.property(
        anyMethod.filter((m) => m !== "GET"),
        fc.string({ maxLength: 80 }),
        longSecret,
        (method, key, secret) => {
          const decision = decideRelayRequest({ method, providedKey: key, secret });
          return decision.action === "reject" && decision.status === 405;
        },
      ),
      RUNS,
    );
    fc.assert(
      fc.property(
        fc.string({ minLength: 8, maxLength: 80 }),
        longSecret,
        (key, secret) => {
          const decision = decideRelayRequest({ method: "GET", providedKey: key, secret });
          if (decision.action !== "reject") return true;
          const text = JSON.stringify(decision);
          return !text.includes(secret) && !text.includes(key);
        },
      ),
      RUNS,
    );
  });
});

/**
 * Feature: faa-403-poller, Property 4: Relay is not an open proxy
 *
 * **Validates: Requirements 2.2**
 */
describe("shapeRelayResponse (property)", () => {
  it("non-2xx keeps the status and limits the body to the error cap", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 599 }).filter((s) => s < 200 || s > 299),
        fc.string({ maxLength: 2000 }),
        (upstreamStatus, bodyText) => {
          const out = shapeRelayResponse({ upstreamStatus, bodyText });
          return (
            out.status === upstreamStatus &&
            out.body.length <= RELAY_ERROR_BODY_CHARS &&
            bodyText.startsWith(out.body) &&
            out.contentType === "text/plain"
          );
        },
      ),
      RUNS,
    );
  });

  it("2xx keeps the status and the whole body as JSON", () => {
    fc.assert(
      fc.property(fc.integer({ min: 200, max: 299 }), fc.string({ maxLength: 2000 }), (upstreamStatus, bodyText) => {
        const out = shapeRelayResponse({ upstreamStatus, bodyText });
        return out.status === upstreamStatus && out.body === bodyText && out.contentType === "application/json";
      }),
      RUNS,
    );
  });
});

/**
 * Feature: faa-403-poller, Property 4: Relay is not an open proxy
 * (and Property 6: The secret never leaks, for the config error info)
 *
 * **Validates: Requirements 2.2, 2.5, 2.6**
 */
describe("resolveRelayConfig (property)", () => {
  const urlVariants = fc.oneof(
    fc.constant(VALID_URL),
    fc.string({ maxLength: 60 }),
    fc.webUrl(),
    fc.constantFrom(
      `http://${RELAY_ALLOWED_HOST}${RELAY_ALLOWED_PATH}`,
      `${VALID_URL}?x=1`,
      `${VALID_URL}#h`,
      `${VALID_URL}/`,
      `${VALID_URL}/extra`,
      `https://${RELAY_ALLOWED_HOST}:8443${RELAY_ALLOWED_PATH}`,
      `https://user:pw@${RELAY_ALLOWED_HOST}${RELAY_ALLOWED_PATH}`,
      `https://aerobriefs.com${RELAY_ALLOWED_PATH}`,
      `https://evil.example/${RELAY_ALLOWED_HOST}${RELAY_ALLOWED_PATH}`,
      `https://${RELAY_ALLOWED_HOST}.evil.example${RELAY_ALLOWED_PATH}`,
      `https://nasstatus.faa.gov/api/airport-events`,
    ),
  );
  const secretVariants = fc.oneof(longSecret, fc.string({ maxLength: RELAY_SECRET_MIN_LENGTH - 1 }));

  it("returns relay only for the exact URL with a secret of at least 32 chars", () => {
    fc.assert(
      fc.property(
        fc.option(urlVariants, { nil: undefined }),
        fc.option(secretVariants, { nil: undefined }),
        (url, secret) => {
          const out = resolveRelayConfig({ url, secret });
          const bothUnset = (url ?? "") === "" && (secret ?? "") === "";
          if (bothUnset) return out.mode === "direct";
          const valid = url === VALID_URL && (secret ?? "").length >= RELAY_SECRET_MIN_LENGTH;
          if (out.mode === "relay") return valid && out.url === VALID_URL && out.secret === secret;
          return !valid && out.mode === "invalid";
        },
      ),
      RUNS,
    );
  });

  it("accepts the exact URL with any long secret", () => {
    fc.assert(
      fc.property(longSecret, (secret) => {
        const out = resolveRelayConfig({ url: VALID_URL, secret });
        return out.mode === "relay" && out.url === VALID_URL && out.secret === secret;
      }),
      RUNS,
    );
  });

  it("invalid info holds only setting names, never the URL or secret", () => {
    fc.assert(
      fc.property(
        fc.option(urlVariants, { nil: undefined }),
        fc.option(secretVariants, { nil: undefined }),
        (url, secret) => {
          const out = resolveRelayConfig({ url, secret });
          if (out.mode !== "invalid") return true;
          const allowed = new Set(["FAA_RELAY_URL", "FAA_RELAY_SECRET"]);
          return (
            out.keys.length > 0 &&
            Object.keys(out).sort().join(",") === "keys,mode" &&
            out.keys.every((k) => allowed.has(k))
          );
        },
      ),
      RUNS,
    );
  });
});
