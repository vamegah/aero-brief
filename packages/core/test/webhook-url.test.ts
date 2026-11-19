import { describe, expect, it } from "vitest";
import { maskWebhookUrl, validateWebhookUrl } from "../src/webhooks/url";

const reason = (input: string) => {
  const r = validateWebhookUrl(input);
  return r.ok ? "ok" : r.reason;
};

describe("validateWebhookUrl", () => {
  it("accepts a normal https URL and normalizes it", () => {
    expect(validateWebhookUrl("https://Hooks.Example.com/a/b?x=1")).toEqual({
      ok: true,
      url: "https://hooks.example.com/a/b?x=1",
      host: "hooks.example.com",
    });
  });

  it("accepts an explicit default port 443", () => {
    expect(reason("https://hooks.example.com:443/x")).toBe("ok");
  });

  it("is idempotent on its own output", () => {
    const first = validateWebhookUrl("https://HOOKS.example.com/a b");
    expect(first.ok).toBe(true);
    if (first.ok) expect(validateWebhookUrl(first.url)).toEqual(first);
  });

  it("accepts a punycoded IDN host", () => {
    const r = validateWebhookUrl("https://bücher.de/hook");
    expect(r).toEqual({ ok: true, url: "https://xn--bcher-kva.de/hook", host: "xn--bcher-kva.de" });
  });

  it("rejects too-long input before parsing", () => {
    expect(reason("https://a.com/" + "x".repeat(2048))).toBe("too_long");
    expect(reason("https://a.com/" + "x".repeat(2048 - 14))).toBe("ok");
  });

  it("rejects unparseable input", () => {
    expect(reason("not a url")).toBe("unparseable");
    expect(reason("")).toBe("unparseable");
  });

  it("rejects non-https schemes", () => {
    expect(reason("http://hooks.example.com")).toBe("scheme");
    expect(reason("ftp://hooks.example.com")).toBe("scheme");
  });

  it("rejects credentials", () => {
    expect(reason("https://user:pw@hooks.example.com")).toBe("credentials");
    expect(reason("https://user@hooks.example.com")).toBe("credentials");
  });

  it("rejects non-default ports", () => {
    expect(reason("https://hooks.example.com:8443")).toBe("port");
  });

  it("rejects fragments", () => {
    expect(reason("https://hooks.example.com/x#frag")).toBe("fragment");
  });

  it("rejects trailing-dot hosts", () => {
    expect(reason("https://hooks.example.com./x")).toBe("trailing_dot");
  });

  it("rejects IPv6 literals", () => {
    expect(reason("https://[::1]/")).toBe("ipv6");
    expect(reason("https://[2001:db8::1]/")).toBe("ipv6");
  });

  it("rejects IPv4 in dotted, decimal, hex, octal and mixed forms", () => {
    for (const u of [
      "https://127.0.0.1/",
      "https://8.8.8.8/",
      "https://2130706433/",
      "https://0x7f000001/",
      "https://0x7f.1/",
      "https://017700000001/",
      "https://0177.0.0.1/",
      "https://127.1/",
      "https://0x7f.0.0.0x1/",
    ]) {
      expect(reason(u), u).toBe("ip_literal");
    }
  });

  it("rejects localhost names", () => {
    expect(reason("https://localhost/")).toBe("localhost");
    expect(reason("https://LOCALHOST/")).toBe("localhost");
    expect(reason("https://app.localhost/")).toBe("localhost");
  });

  it("rejects single-label hosts", () => {
    expect(reason("https://intranet/")).toBe("single_label");
  });

  it("rejects reserved suffixes", () => {
    for (const s of ["local", "internal", "lan", "home.arpa", "test", "invalid", "example"]) {
      expect(reason(`https://svc.${s}/`), s).toBe("reserved_suffix");
    }
  });

  it("applies rules in order", () => {
    expect(reason("http://user@localhost:8080/#f")).toBe("scheme");
    expect(reason("https://user@localhost:8080/#f")).toBe("credentials");
    expect(reason("https://localhost:8080/#f")).toBe("port");
    expect(reason("https://localhost/#f")).toBe("fragment");
  });
});

describe("maskWebhookUrl", () => {
  it("returns only the lowercased host", () => {
    expect(maskWebhookUrl("https://Hooks.Example.com/secret/path?token=abc")).toBe("hooks.example.com");
  });

  it("drops userinfo and port", () => {
    expect(maskWebhookUrl("https://u:p@hooks.example.com:8443/x")).toBe("hooks.example.com");
  });
});
