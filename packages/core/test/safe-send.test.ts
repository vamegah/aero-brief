import { describe, expect, it } from "vitest";
import {
  filterAllowlisted,
  isSafeSendMode,
  parseAllowlist,
  parseEmailAllowlist,
  parseHostAllowlist,
} from "../src/safe-send";

describe("isSafeSendMode", () => {
  it("is on when absent or true, off only for exact 'false'", () => {
    expect(isSafeSendMode(undefined)).toBe(true);
    expect(isSafeSendMode(null)).toBe(true);
    expect(isSafeSendMode("true")).toBe(true);
    expect(isSafeSendMode("")).toBe(true);
    expect(isSafeSendMode("FALSE")).toBe(true);
    expect(isSafeSendMode("0")).toBe(true);
    expect(isSafeSendMode("false")).toBe(false);
  });
});

describe("parseAllowlist", () => {
  it("trims, lowercases, drops empties and duplicates", () => {
    expect(parseAllowlist(" A@x.com, ,b@X.com,a@x.com")).toEqual(["a@x.com", "b@x.com"]);
    expect(parseAllowlist(undefined)).toEqual([]);
    expect(parseAllowlist("")).toEqual([]);
  });
  it("always includes delivered@resend.dev for emails only", () => {
    expect(parseEmailAllowlist(undefined)).toEqual(["delivered@resend.dev"]);
    expect(parseHostAllowlist(undefined)).toEqual([]);
  });
});

describe("filterAllowlisted", () => {
  const key = (s: string) => s;
  it("returns [] for an empty allowlist", () => {
    expect(filterAllowlisted(["a@x.com"], [], key)).toEqual([]);
  });
  it("matches emails case-insensitively", () => {
    const list = parseEmailAllowlist("Me@Example.com");
    expect(filterAllowlisted(["ME@example.COM", "other@example.com"], list, key)).toEqual([
      "ME@example.COM",
    ]);
  });
  it("allows delivered@resend.dev via the email list but not the host list", () => {
    expect(filterAllowlisted(["delivered@resend.dev"], parseEmailAllowlist(""), key)).toHaveLength(1);
    expect(filterAllowlisted(["delivered@resend.dev"], parseHostAllowlist(""), key)).toEqual([]);
  });
  it("matches hosts exactly, not by suffix", () => {
    const list = parseHostAllowlist("Hooks.Slack.com");
    const items = [{ h: "hooks.slack.com" }, { h: "evil.hooks.slack.com" }, { h: "hooks.slack.com.evil.io" }];
    expect(filterAllowlisted(items, list, (i) => i.h)).toEqual([{ h: "hooks.slack.com" }]);
  });
});
