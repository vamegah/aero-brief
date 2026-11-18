// Feature: aerobrief-phase2, Property 1: Flag parsing defaults and independence
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { parseFlags } from "../src/flags";
import { FLAG_NAMES } from "../src/schemas/flags";

const NUM_RUNS = 200;
const names: readonly string[] = FLAG_NAMES;

const rawValue = fc.oneof(
  fc.constantFrom("true", "false", "TRUE", "True", "False", " true", "true ", "\ttrue\n", "1", "0", "yes", ""),
  fc.constant(undefined),
  fc.string(),
  fc.string({ unit: "grapheme" }),
);

const extraKeys = fc.dictionary(
  fc.string({ minLength: 1 }).filter((k) => !names.includes(k)),
  fc.oneof(fc.string(), fc.constant(undefined)),
);

const flagRecord = fc.record({
  FEATURE_DARK_MODE: rawValue,
  FEATURE_HIGH_CONTRAST: rawValue,
  FEATURE_DIGESTS: rawValue,
  FEATURE_WEBHOOKS: rawValue,
});

const rawEnv = fc.tuple(flagRecord, extraKeys).map(([flagsRaw, extra]) => {
  const env: Record<string, string | undefined> = { ...extra };
  for (const name of FLAG_NAMES) env[name] = flagsRaw[name];
  return env;
});

describe("Property 1: Flag parsing defaults and independence", () => {
  /** **Validates: Requirements 1.2, 1.3, 1.8** */
  it("a flag is true iff its raw value is exactly \"true\"", () => {
    fc.assert(
      fc.property(rawEnv, (env) => {
        const { flags } = parseFlags(env);
        for (const name of FLAG_NAMES) {
          expect(typeof flags[name]).toBe("boolean");
          expect(flags[name]).toBe(env[name] === "true");
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  /** **Validates: Requirements 1.2, 1.3, 1.8** */
  it("changing one flag's raw value never changes another flag's parsed value", () => {
    fc.assert(
      fc.property(rawEnv, fc.constantFrom(...FLAG_NAMES), rawValue, (env, changed, newValue) => {
        const before = parseFlags(env).flags;
        const after = parseFlags({ ...env, [changed]: newValue }).flags;
        for (const name of FLAG_NAMES) {
          if (name !== changed) expect(after[name]).toBe(before[name]);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  /** **Validates: Requirements 1.2, 1.3, 1.8** */
  it("emits one warning per invalid present flag, naming only the flag", () => {
    fc.assert(
      fc.property(rawEnv, (env) => {
        const { warnings } = parseFlags(env);
        const invalid = FLAG_NAMES.filter((n) => {
          const v = env[n];
          return v !== undefined && v !== "true" && v !== "false";
        });
        expect(warnings).toHaveLength(invalid.length);
        for (const name of FLAG_NAMES) {
          const mentioning = warnings.filter((w) => w.includes(name));
          expect(mentioning).toHaveLength(invalid.includes(name) ? 1 : 0);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  /** **Validates: Requirements 1.8** */
  it("warnings never contain the raw value", () => {
    // Marker values are distinct from any wording a warning could use.
    const marker = fc
      .string({ minLength: 1 })
      .map((s) => `Zq#${s}#9x`)
      .filter((s) => s !== "true" && s !== "false");
    fc.assert(
      fc.property(fc.constantFrom(...FLAG_NAMES), marker, (name, value) => {
        const { flags, warnings } = parseFlags({ [name]: value });
        expect(flags[name]).toBe(false);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain(name);
        expect(warnings[0]).not.toContain(value);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  /** **Validates: Requirements 1.2, 1.3** */
  it("ignores unrelated keys", () => {
    fc.assert(
      fc.property(rawEnv, extraKeys, (env, otherExtra) => {
        const base = parseFlags(env);
        const withOther = parseFlags({ ...otherExtra, ...env });
        expect(withOther).toEqual(base);
        const onlyFlags: Record<string, string | undefined> = {};
        for (const name of FLAG_NAMES) onlyFlags[name] = env[name];
        expect(parseFlags(onlyFlags)).toEqual(base);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("defaults every flag to off for an empty record", () => {
    const { flags, warnings } = parseFlags({});
    expect(Object.values(flags)).toEqual([false, false, false, false]);
    expect(warnings).toEqual([]);
  });
});
