import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/env";

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
