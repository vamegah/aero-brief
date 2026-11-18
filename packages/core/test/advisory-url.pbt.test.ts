import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { acceptAdvisoryUrl } from "../src/advisory-url";

const isFaaHost = (h: string): boolean => h === "faa.gov" || h.endsWith(".faa.gov");

const label = fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/);

const anyUrlArb = fc
  .tuple(
    fc.constantFrom("http", "https", "ftp", "javascript", "data", "HTTPS"),
    fc.oneof(
      label.map((l) => `${l}.com`),
      label.map((l) => `${l}faa.gov`),
      label.map((l) => `faa.gov.${l}.com`),
      label.map((l) => `${l}.faa.gov`),
      fc.constant("faa.gov"),
      label.map((l) => `faa.gov@${l}.com`),
    ),
    fc.constantFrom("", "/", "/a/b?x=1#h"),
  )
  .map(([scheme, host, path]) => `${scheme}://${host}${path}`);

const validArb = fc
  .tuple(fc.array(label, { maxLength: 3 }), fc.constantFrom("", "/", "/adv/x?y=1", "/a#frag"), fc.constantFrom("", " ", "\n"))
  .map(([subs, path, ws]) => `${ws}https://${[...subs, "faa.gov"].join(".")}${path}${ws}`);

// Feature: aerobrief, Property 38: Advisory URL acceptance
// **Validates: Requirements 17.4, 17.5**
describe("Property 38: Advisory URL acceptance", () => {
  it("output is null or an https URL on faa.gov or a subdomain", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.webUrl(), anyUrlArb), (raw) => {
        const out = acceptAdvisoryUrl(raw);
        if (out === null) return;
        const url = new URL(out);
        expect(url.protocol).toBe("https:");
        expect(url.username).toBe("");
        expect(url.password).toBe("");
        expect(isFaaHost(url.hostname)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it("accepts every valid https faa.gov URL", () => {
    fc.assert(
      fc.property(validArb, (raw) => {
        expect(acceptAdvisoryUrl(raw)).not.toBeNull();
      }),
      { numRuns: 200 },
    );
  });

  it("never throws on arbitrary input", () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        const out = acceptAdvisoryUrl(raw);
        expect(out === null || typeof out === "string").toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
