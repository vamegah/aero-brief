import { describe, expect, it } from "vitest";
import { classifyMagicLink, isRateLimited, validateEmail, type LinkState } from "../src/account";

describe("validateEmail", () => {
  it("trims and lower-cases", () => {
    expect(validateEmail("  Pilot@Example.COM \n")).toEqual({ ok: true, email: "pilot@example.com" });
  });

  it.each(["", "   ", "plain", "@example.com", "a@", "a@b", "a b@example.com", "a@@example.com", ".a@example.com", "a..b@example.com", "a@-example.com", "a@example..com"])(
    "rejects %j",
    (input) => {
      expect(validateEmail(input).ok).toBe(false);
    },
  );

  it("accepts plus tags and subdomains", () => {
    expect(validateEmail("a+tag@mail.example.co.uk")).toEqual({ ok: true, email: "a+tag@mail.example.co.uk" });
  });

  it("accepts exactly 254 characters and rejects 255", () => {
    const build = (n: number): string => `a@${"d".repeat(n)}.com`;
    expect(build(248).length).toBe(254);
    expect(validateEmail(build(248)).ok).toBe(true);
    expect(build(249).length).toBe(255);
    expect(validateEmail(build(249)).ok).toBe(false);
  });

  it("measures length after trimming", () => {
    const padded = `  a@${"d".repeat(10)}.com  `;
    expect(validateEmail(padded).ok).toBe(true);
  });
});

describe("classifyMagicLink", () => {
  const created = new Date("2025-01-01T12:00:00.000Z");
  const link = (over: Partial<LinkState> = {}): LinkState => ({
    createdAt: created,
    usedAt: null,
    invalidatedAt: null,
    ...over,
  });
  const at = (ms: number): Date => new Date(created.getTime() + ms);
  const MIN = 60_000;

  it("is valid at creation and just under 15 minutes", () => {
    expect(classifyMagicLink(link(), at(0))).toBe("valid");
    expect(classifyMagicLink(link(), at(15 * MIN - 1))).toBe("valid");
  });

  it("is expired at exactly 15 minutes", () => {
    expect(classifyMagicLink(link(), at(15 * MIN))).toBe("expired");
    expect(classifyMagicLink(link(), at(60 * MIN))).toBe("expired");
  });

  it("is used when redeemed, even after expiry", () => {
    expect(classifyMagicLink(link({ usedAt: at(MIN) }), at(2 * MIN))).toBe("used");
    expect(classifyMagicLink(link({ usedAt: at(MIN) }), at(30 * MIN))).toBe("used");
  });

  it("is invalid when unknown or invalidated", () => {
    expect(classifyMagicLink(null, at(0))).toBe("invalid");
    expect(classifyMagicLink(link({ invalidatedAt: at(0) }), at(MIN))).toBe("invalid");
    expect(classifyMagicLink(link({ invalidatedAt: at(0), usedAt: at(MIN) }), at(MIN))).toBe("invalid");
  });
});

describe("isRateLimited", () => {
  const now = new Date("2025-01-01T12:00:00.000Z");
  const ago = (ms: number): Date => new Date(now.getTime() - ms);
  const MIN = 60_000;

  it("is false for 0 to 4 recent requests", () => {
    expect(isRateLimited([], now)).toBe(false);
    expect(isRateLimited([ago(MIN), ago(2 * MIN), ago(3 * MIN), ago(4 * MIN)], now)).toBe(false);
  });

  it("is true at 5 recent requests", () => {
    expect(isRateLimited([1, 2, 3, 4, 5].map((m) => ago(m * MIN)), now)).toBe(true);
  });

  it("does not count requests older than 60 minutes", () => {
    const times = [ago(MIN), ago(2 * MIN), ago(3 * MIN), ago(4 * MIN), ago(60 * MIN + 1)];
    expect(isRateLimited(times, now)).toBe(false);
  });

  it("counts a request exactly 60 minutes old", () => {
    const times = [ago(MIN), ago(2 * MIN), ago(3 * MIN), ago(4 * MIN), ago(60 * MIN)];
    expect(isRateLimited(times, now)).toBe(true);
  });

  it("does not count requests after now", () => {
    const times = [ago(MIN), ago(2 * MIN), ago(3 * MIN), ago(4 * MIN), new Date(now.getTime() + MIN)];
    expect(isRateLimited(times, now)).toBe(false);
  });
});
