import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { EMAIL_MAX_LENGTH, validateEmail } from "../src/account";

// Feature: aerobrief, Property 20: Email address validation
// **Validates: Requirements 7.1, 7.5**

const NUM_RUNS = 100;

const LOCAL_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789!#$%&'*+/=?^_`{|}~-".split("");
const ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
const ALNUM_HYPHEN = [...ALNUM, "-"];

const localAtom: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...LOCAL_CHARS), { minLength: 1, maxLength: 12 })
  .map((cs) => cs.join(""));

const localPart: fc.Arbitrary<string> = fc
  .array(localAtom, { minLength: 1, maxLength: 4 })
  .map((atoms) => atoms.join("."))
  .filter((s) => s.length <= 64);

const domainLabel: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(...ALNUM),
    fc.array(fc.constantFrom(...ALNUM_HYPHEN), { maxLength: 10 }),
    fc.constantFrom(...ALNUM),
  )
  .map(([first, mid, last]) => first + mid.join("") + last);

const domainPart: fc.Arbitrary<string> = fc
  .array(domainLabel, { minLength: 2, maxLength: 4 })
  .map((labels) => labels.join("."));

const validEmail: fc.Arbitrary<string> = fc
  .tuple(localPart, domainPart)
  .map(([l, d]) => `${l}@${d}`)
  .filter((s) => s.length <= EMAIL_MAX_LENGTH);

// Randomly upper-cases characters; validation normalises case.
const withRandomCase = (s: string): fc.Arbitrary<string> =>
  fc
    .array(fc.boolean(), { minLength: s.length, maxLength: s.length })
    .map((flags) => [...s].map((c, i) => (flags[i] === true ? c.toUpperCase() : c)).join(""));

const whitespace: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(" ", "\t", "\n"), { maxLength: 3 })
  .map((cs) => cs.join(""));

const tooLongEmail: fc.Arbitrary<string> = fc
  .tuple(localPart, fc.integer({ min: 5, max: 8 }))
  .map(([l, n]) => `${l}@${Array.from({ length: n }, () => "a".repeat(60)).join(".")}`);

const noAt: fc.Arbitrary<string> = fc
  .string({ maxLength: 40 })
  .filter((s) => !s.includes("@"));

const twoAts: fc.Arbitrary<string> = fc
  .tuple(localPart, domainPart, domainPart)
  .map(([l, d1, d2]) => `${l}@${d1}@${d2}`);

const emptyLocal: fc.Arbitrary<string> = domainPart.map((d) => `@${d}`);

const emptyDomain: fc.Arbitrary<string> = localPart.map((l) => `${l}@`);

const dotlessDomain: fc.Arbitrary<string> = fc
  .tuple(localPart, domainLabel)
  .map(([l, d]) => `${l}@${d}`);

const badDots: fc.Arbitrary<string> = fc
  .tuple(localAtom, domainPart, fc.constantFrom("lead", "trail", "double"))
  .map(([a, d, kind]) => {
    const local = kind === "lead" ? `.${a}` : kind === "trail" ? `${a}.` : `${a}..${a}`;
    return `${local}@${d}`;
  });

const innerSpace: fc.Arbitrary<string> = fc
  .tuple(localAtom, localAtom, domainPart)
  .map(([a, b, d]) => `${a} ${b}@${d}`);

const hyphenEdgeLabel: fc.Arbitrary<string> = fc
  .tuple(localPart, domainLabel, fc.boolean())
  .map(([l, d, lead]) => `${l}@${lead ? "-" : ""}${d}${lead ? "" : "-"}.com`);

describe("Property 20: Email address validation", () => {
  test("accepts every generated valid address of at most 254 characters", () => {
    fc.assert(
      fc.property(validEmail, (email) => {
        const result = validateEmail(email);
        expect(result).toEqual({ ok: true, email });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  test("accepts valid addresses regardless of case and surrounding whitespace, returning the normalised form", () => {
    const input = validEmail.chain((email) =>
      fc.tuple(fc.constant(email), withRandomCase(email), whitespace, whitespace),
    );
    fc.assert(
      fc.property(input, ([email, cased, pre, post]) => {
        const result = validateEmail(`${pre}${cased}${post}`);
        expect(result).toEqual({ ok: true, email });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  test("rejects addresses longer than 254 characters", () => {
    fc.assert(
      fc.property(tooLongEmail, (email) => {
        expect(email.length).toBeGreaterThan(EMAIL_MAX_LENGTH);
        expect(validateEmail(email)).toEqual({ ok: false });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  test("rejects strings that are not valid addresses", () => {
    const invalid = fc.oneof(
      noAt,
      twoAts,
      emptyLocal,
      emptyDomain,
      dotlessDomain,
      badDots,
      innerSpace,
      hyphenEdgeLabel,
      fc.constantFrom("", " ", "@", "a@", "@b.com", "a@b", "a@@b.com"),
    );
    fc.assert(
      fc.property(invalid, (s) => {
        expect(validateEmail(s)).toEqual({ ok: false });
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
