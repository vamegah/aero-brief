import { describe, expect, it } from "vitest";
import {
  RELAY_ERROR_BODY_CHARS,
  RELAY_MAX_BODY_BYTES,
  RELAY_TARGET_URL,
  decideRelayRequest,
  relayEnvSchema,
  resolveRelayConfig,
  shapeRelayResponse,
  timingSafeEqualStrings,
} from "../src/faa-relay";

const SECRET = "s".repeat(32);
const URL_OK = "https://www.aerobriefs.com/api/internal/faa-relay";

describe("constants", () => {
  it("fixes the target and the body cap", () => {
    expect(RELAY_TARGET_URL).toBe("https://nasstatus.faa.gov/api/airport-events");
    expect(RELAY_MAX_BODY_BYTES).toBe(1_048_576);
  });
});

describe("timingSafeEqualStrings", () => {
  it("accepts equal strings", () => {
    expect(timingSafeEqualStrings(SECRET, SECRET)).toBe(true);
    expect(timingSafeEqualStrings("", "")).toBe(true);
  });
  it("rejects different lengths", () => {
    expect(timingSafeEqualStrings("abc", "abcd")).toBe(false);
    expect(timingSafeEqualStrings("abc", "")).toBe(false);
  });
  it("rejects one differing character", () => {
    expect(timingSafeEqualStrings("abcdef", "abcdeg")).toBe(false);
  });
});

describe("decideRelayRequest", () => {
  it("500 when the secret is missing or short", () => {
    for (const secret of [undefined, "", "x".repeat(31)]) {
      expect(decideRelayRequest({ method: "GET", providedKey: "x", secret })).toEqual({
        action: "reject",
        status: 500,
        error: "relay_misconfigured",
      });
    }
  });
  it("405 for a method other than GET, before the key check", () => {
    for (const method of ["POST", "HEAD", "PUT", "get"]) {
      expect(decideRelayRequest({ method, providedKey: SECRET, secret: SECRET })).toMatchObject({
        action: "reject",
        status: 405,
      });
    }
  });
  it("401 for a missing or wrong key", () => {
    for (const providedKey of [null, undefined, "", "wrong", SECRET + "x"]) {
      expect(decideRelayRequest({ method: "GET", providedKey, secret: SECRET })).toMatchObject({
        action: "reject",
        status: 401,
        error: "unauthorized",
      });
    }
  });
  it("fetches for GET with the right key", () => {
    expect(decideRelayRequest({ method: "GET", providedKey: SECRET, secret: SECRET })).toEqual({ action: "fetch" });
  });
});

describe("shapeRelayResponse", () => {
  it("passes a 2xx body as JSON", () => {
    expect(shapeRelayResponse({ upstreamStatus: 200, bodyText: "[1,2]" })).toEqual({
      status: 200,
      contentType: "application/json",
      body: "[1,2]",
    });
  });
  it("keeps the status and a text excerpt for non-2xx", () => {
    expect(shapeRelayResponse({ upstreamStatus: 403, bodyText: "Access Denied" })).toEqual({
      status: 403,
      contentType: "text/plain",
      body: "Access Denied",
    });
  });
  it("cuts a non-2xx body at 300 characters", () => {
    const shaped = shapeRelayResponse({ upstreamStatus: 500, bodyText: "a".repeat(1000) });
    expect(shaped.body).toHaveLength(RELAY_ERROR_BODY_CHARS);
    expect(RELAY_ERROR_BODY_CHARS).toBe(300);
  });
  it("does not cut a 2xx body", () => {
    expect(shapeRelayResponse({ upstreamStatus: 200, bodyText: "a".repeat(1000) }).body).toHaveLength(1000);
  });
});

describe("relayEnvSchema", () => {
  it("rejects 31 characters and accepts 32", () => {
    expect(relayEnvSchema.safeParse({ FAA_RELAY_SECRET: "x".repeat(31) }).success).toBe(false);
    expect(relayEnvSchema.safeParse({ FAA_RELAY_SECRET: "x".repeat(32) }).success).toBe(true);
  });
});

describe("resolveRelayConfig", () => {
  it("is direct when both are unset or empty", () => {
    expect(resolveRelayConfig({ url: undefined, secret: undefined })).toEqual({ mode: "direct" });
    expect(resolveRelayConfig({ url: "", secret: "" })).toEqual({ mode: "direct" });
  });
  it("is relay for a valid pair", () => {
    expect(resolveRelayConfig({ url: URL_OK, secret: SECRET })).toEqual({ mode: "relay", url: URL_OK, secret: SECRET });
  });
  it("is invalid when only one is set, naming the missing key", () => {
    expect(resolveRelayConfig({ url: URL_OK, secret: undefined })).toEqual({
      mode: "invalid",
      keys: ["FAA_RELAY_SECRET"],
    });
    expect(resolveRelayConfig({ url: undefined, secret: SECRET })).toEqual({
      mode: "invalid",
      keys: ["FAA_RELAY_URL"],
    });
  });
  it.each([
    ["http scheme", "http://www.aerobriefs.com/api/internal/faa-relay"],
    ["other host", "https://evil.example/api/internal/faa-relay"],
    ["suffix host", "https://www.aerobriefs.com.evil.com/api/internal/faa-relay"],
    ["userinfo", "https://user:pw@www.aerobriefs.com/api/internal/faa-relay"],
    ["userinfo host trick", "https://www.aerobriefs.com@evil.example/api/internal/faa-relay"],
    ["port", "https://www.aerobriefs.com:8443/api/internal/faa-relay"],
    ["other path", "https://www.aerobriefs.com/api/other"],
    ["query", "https://www.aerobriefs.com/api/internal/faa-relay?x=1"],
    ["not a URL", "not a url"],
  ])("rejects %s", (_name, url) => {
    expect(resolveRelayConfig({ url, secret: SECRET })).toEqual({ mode: "invalid", keys: ["FAA_RELAY_URL"] });
  });
  it("rejects a short secret without echoing it", () => {
    const short = "x".repeat(31);
    const result = resolveRelayConfig({ url: URL_OK, secret: short });
    expect(result).toEqual({ mode: "invalid", keys: ["FAA_RELAY_SECRET"] });
    expect(JSON.stringify(result)).not.toContain(short);
  });
  it("names both keys when both are bad", () => {
    expect(resolveRelayConfig({ url: "http://x", secret: "short" })).toEqual({
      mode: "invalid",
      keys: ["FAA_RELAY_URL", "FAA_RELAY_SECRET"],
    });
  });
});
