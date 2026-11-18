import { describe, expect, it } from "vitest";
import { isMalformedPreviousExpiry, parseEnv } from "../src/env";

const valid = {
  DATABASE_URL: "postgresql://user:pw@host.neon.tech/db",
  RESEND_API_KEY: "re_secret",
  UNSUBSCRIBE_SECRET: "sig_secret",
  FRONTEND_URL: "https://app.example.com",
  MAIL_FROM: "AeroBrief <alerts@example.com>",
};

describe("parseEnv", () => {
  it("accepts a complete env", () => {
    expect(parseEnv(valid).FRONTEND_URL).toBe("https://app.example.com");
  });

  it("names missing keys but never echoes values", () => {
    const { RESEND_API_KEY: _omit, ...rest } = valid;
    const bad = { ...rest, DATABASE_URL: "not-a-url-secret" };
    let message = "";
    try {
      parseEnv(bad);
    } catch (err) {
      message = err instanceof Error ? err.message : "";
    }
    expect(message).toContain("RESEND_API_KEY");
    expect(message).toContain("DATABASE_URL");
    expect(message).not.toContain("not-a-url-secret");
  });
});

describe("parseEnv optional previous unsubscribe secret", () => {
  it("is absent by default", () => {
    const env = parseEnv(valid);
    expect(env.UNSUBSCRIBE_SECRET_PREVIOUS).toBeUndefined();
    expect(env.UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT).toBeUndefined();
  });

  it("keeps a valid ISO expiry", () => {
    const env = parseEnv({ ...valid, UNSUBSCRIBE_SECRET_PREVIOUS: "old", UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT: "2030-01-01T00:00:00Z" });
    expect(env.UNSUBSCRIBE_SECRET_PREVIOUS).toBe("old");
    expect(env.UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT).toBe("2030-01-01T00:00:00Z");
  });

  it("drops a malformed expiry without failing startup", () => {
    const raw = { ...valid, UNSUBSCRIBE_SECRET_PREVIOUS: "old", UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT: "next tuesday" };
    expect(parseEnv(raw).UNSUBSCRIBE_SECRET_PREVIOUS_EXPIRES_AT).toBeUndefined();
    expect(isMalformedPreviousExpiry(raw)).toBe(true);
    expect(isMalformedPreviousExpiry(valid)).toBe(false);
  });
});
