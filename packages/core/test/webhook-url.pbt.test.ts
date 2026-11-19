import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { MAX_WEBHOOK_URL_LENGTH, maskWebhookUrl, validateWebhookUrl } from "../src/webhooks/url";

const RUNS = { numRuns: 200 };

const octet = fc.integer({ min: 0, max: 255 });
const ipv4Parts = fc.tuple(octet, octet, octet, octet);

const toNum = ([a, b, c, d]: number[]): number => ((a! * 256 + b!) * 256 + c!) * 256 + d!;

/** Dotted, decimal, hex, octal and mixed notations of one IPv4 address. */
const ipv4Host = ipv4Parts.chain((p) => {
  const [a, b, c, d] = p as [number, number, number, number];
  const n = toNum(p);
  const pick = (x: number, kind: number): string =>
    kind === 0 ? String(x) : kind === 1 ? `0x${x.toString(16)}` : `0${x.toString(8)}`;
  return fc.oneof(
    fc.constant(`${a}.${b}.${c}.${d}`),
    fc.constant(String(n)),
    fc.constant(`0x${n.toString(16)}`),
    fc.constant(`0X${n.toString(16).toUpperCase()}`),
    fc.constant(`0${n.toString(8)}`),
    fc
      .tuple(fc.integer({ min: 0, max: 2 }), fc.integer({ min: 0, max: 2 }), fc.integer({ min: 0, max: 2 }), fc.integer({ min: 0, max: 2 }))
      .map(([k1, k2, k3, k4]) => `${pick(a, k1)}.${pick(b, k2)}.${pick(c, k3)}.${pick(d, k4)}`),
    fc.constant(`${a}.${b}.${(c * 256 + d)}`),
    fc.constant(`${a}.${(b * 256 + c) * 256 + d}`),
  );
});

const hex16 = fc.integer({ min: 0, max: 0xffff }).map((n) => n.toString(16));
const ipv6Host = fc.oneof(
  fc.array(hex16, { minLength: 8, maxLength: 8 }).map((g) => `[${g.join(":")}]`),
  fc.array(hex16, { minLength: 1, maxLength: 6 }).map((g) => `[${g.join(":")}::]`),
  fc.array(hex16, { minLength: 1, maxLength: 6 }).map((g) => `[::${g.join(":")}]`),
  ipv4Parts.map(([a, b, c, d]) => `[::ffff:${a}.${b}.${c}.${d}]`),
  fc.constantFrom("[::1]", "[::]", "[fe80::1]", "[2001:db8::1]"),
);

const label = fc.stringMatching(/^[a-z][a-z0-9]{0,8}$/);
const path = fc.constantFrom("", "/", "/hook", "/a/b?x=1");

const unsafeHost = fc.oneof(
  ipv4Host,
  ipv6Host,
  fc.constantFrom("localhost", "LOCALHOST"),
  label.map((l) => `${l}.localhost`),
  label.map((l) => l), // single label
  fc.tuple(label, fc.constantFrom("local", "internal", "lan", "home.arpa", "test", "invalid", "example")).map(
    ([l, s]) => `${l}.${s}`,
  ),
  label.map((l) => `${l}.com.`), // trailing dot
);

const unsafeUrl = fc.tuple(unsafeHost, path).map(([h, p]) => `https://${h}${p}`);

const publicHost = fc.tuple(label, label).map(([a, b]) => `${a}.${b}.com`);

const anyUrl = fc.oneof(
  fc.string({ maxLength: 60 }),
  fc.webUrl(),
  fc.tuple(fc.constantFrom("http", "https", "ftp", "HTTPS"), fc.oneof(publicHost, unsafeHost), fc.constantFrom("", ":8443", ":443", "@x", "u:p@"), path, fc.constantFrom("", "#f")).map(
    ([s, h, extra, p, f]) => (extra.startsWith("@") || extra.endsWith("@") ? `${s}://${extra}${h}${p}${f}` : `${s}://${h}${extra}${p}${f}`),
  ),
  unsafeUrl,
);

describe("Property 11: Webhook URL safety", () => {
  // Feature: aerobrief-phase2, Property 11: Webhook URL safety
  // **Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.10, 14.11, 14.12**
  it("any accepted URL is https, clean, short, and has a safe public host", () => {
    fc.assert(
      fc.property(anyUrl, (input) => {
        const r = validateWebhookUrl(input);
        if (!r.ok) return;
        const u = new URL(r.url);
        expect(u.protocol).toBe("https:");
        expect(u.port).toBe("");
        expect(u.username).toBe("");
        expect(u.password).toBe("");
        expect(u.hash).toBe("");
        expect(input.length).toBeLessThanOrEqual(MAX_WEBHOOK_URL_LENGTH);
        const h = r.host;
        expect(h.startsWith("[")).toBe(false);
        expect(h.endsWith(".")).toBe(false);
        expect(h.includes(".")).toBe(true);
        expect(h === "localhost" || h.endsWith(".localhost")).toBe(false);
        expect(/^[0-9]+$/.test(h.slice(h.lastIndexOf(".") + 1))).toBe(false);
        expect(/^0x/i.test(h.slice(h.lastIndexOf(".") + 1))).toBe(false);
        for (const s of [".local", ".internal", ".lan", ".home.arpa", ".test", ".invalid", ".example"]) {
          expect(h.endsWith(s)).toBe(false);
        }
      }),
      RUNS,
    );
  });

  // Feature: aerobrief-phase2, Property 11: Webhook URL safety
  it("rejects every generated unsafe host (IPv4 in any notation, IPv6, localhost, single-label, reserved suffix, trailing dot)", () => {
    fc.assert(
      fc.property(unsafeUrl, (input) => {
        const r = validateWebhookUrl(input);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(typeof r.reason).toBe("string");
      }),
      RUNS,
    );
  });

  // Feature: aerobrief-phase2, Property 11: Webhook URL safety
  it("rejects credentials, explicit ports, fragments and over-long URLs", () => {
    fc.assert(
      fc.property(
        publicHost,
        path,
        fc.constantFrom("u@", "u:p@", ":p@"),
        fc.constantFrom(":8443", ":80", ":1"),
        (h, p, cred, port) => {
          expect(validateWebhookUrl(`https://${cred}${h}${p}`).ok).toBe(false);
          expect(validateWebhookUrl(`https://${h}${port}${p}`).ok).toBe(false);
          expect(validateWebhookUrl(`https://${h}${p}#frag`).ok).toBe(false);
          expect(validateWebhookUrl(`https://${h}/${"a".repeat(MAX_WEBHOOK_URL_LENGTH)}`).ok).toBe(false);
        },
      ),
      RUNS,
    );
  });
});

describe("Property 12: Webhook URL validation is idempotent", () => {
  // Feature: aerobrief-phase2, Property 12: Webhook URL validation is idempotent
  // **Validates: Requirements 14.13**
  it("revalidating an accepted url returns ok with the same url and host", () => {
    fc.assert(
      fc.property(anyUrl, (input) => {
        const first = validateWebhookUrl(input);
        if (!first.ok) return;
        const second = validateWebhookUrl(first.url);
        expect(second.ok).toBe(true);
        if (second.ok) {
          expect(second.url).toBe(first.url);
          expect(second.host).toBe(first.host);
        }
      }),
      RUNS,
    );
  });

  // Feature: aerobrief-phase2, Property 12: Webhook URL validation is idempotent
  it("validation is deterministic, including rejections", () => {
    fc.assert(
      fc.property(anyUrl, (input) => {
        expect(validateWebhookUrl(input)).toEqual(validateWebhookUrl(input));
      }),
      RUNS,
    );
  });
});

describe("Property 13: URL masking exposes only the host", () => {
  // Feature: aerobrief-phase2, Property 13: URL masking exposes only the host
  // **Validates: Requirements 13.6, 13.13**
  const subdomains = fc.array(label, { minLength: 0, maxLength: 3 });
  // Longer than any generated host label, so it can never occur inside the host.
  const token = fc.stringMatching(/^[A-Za-z0-9]{16,40}$/);
  const segments = fc.array(token, { minLength: 0, maxLength: 4 });
  const query = fc.oneof(fc.constant(""), token.map((t) => `?token=${t}&x=1`));

  it("returns exactly the lowercase host and no path, query, token, port or '@'", () => {
    fc.assert(
      fc.property(
        subdomains,
        label,
        fc.constantFrom("com", "net", "io", "org"),
        fc.boolean(),
        segments,
        query,
        (subs, name, tld, upper, segs, q) => {
          const host = [...subs, name, tld].join(".");
          const shownHost = upper ? host.toUpperCase() : host;
          const input = `https://${shownHost}${segs.map((s) => `/${s}`).join("")}${q}`;
          const validated = validateWebhookUrl(input);
          if (!validated.ok) return;
          const masked = maskWebhookUrl(validated.url);
          expect(masked).toBe(host);
          expect(masked).toBe(masked.toLowerCase());
          for (const bad of ["/", "?", "#", "@", ":", "="]) expect(masked.includes(bad)).toBe(false);
          for (const s of segs) expect(masked.includes(s)).toBe(false);
          expect(masked.includes("token")).toBe(false);
          expect(maskWebhookUrl(input)).toBe(host);
        },
      ),
      RUNS,
    );
  });

  it("masks a Slack-style URL to its host", () => {
    expect(maskWebhookUrl("https://hooks.slack.com/services/T000/B000/XXXX")).toBe("hooks.slack.com");
  });
});
