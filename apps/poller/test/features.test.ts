import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createLogger, FLAG_NAMES } from "@aerobrief/core";
import { readFlags } from "../src/features";

function capture() {
  const lines: string[] = [];
  const push = (line: string) => void lines.push(line);
  const logger = createLogger([], { debug: push, info: push, warn: push, error: push });
  return { lines, logger };
}

describe("readFlags", () => {
  it("returns all flags off and logs nothing when none are set", () => {
    const { lines, logger } = capture();
    const flags = readFlags({ DATABASE_URL: "x" }, logger);
    expect(Object.values(flags)).toEqual([false, false, false, false]);
    expect(lines).toEqual([]);
  });

  it("reads each flag independently", () => {
    const { lines, logger } = capture();
    const flags = readFlags({ FEATURE_DIGESTS: "true", FEATURE_WEBHOOKS: "false" }, logger);
    expect(flags).toEqual({
      FEATURE_DARK_MODE: false,
      FEATURE_HIGH_CONTRAST: false,
      FEATURE_DIGESTS: true,
      FEATURE_WEBHOOKS: false,
    });
    expect(lines).toEqual([]);
  });

  it("treats an invalid flag as off and warns naming the flag, not the value or secrets", () => {
    const { lines, logger } = capture();
    const flags = readFlags(
      { FEATURE_DIGESTS: "TOP-SECRET-yes", FEATURE_WEBHOOKS: "true", RESEND_API_KEY: "re_secret" },
      logger,
    );
    expect(flags.FEATURE_DIGESTS).toBe(false);
    expect(flags.FEATURE_WEBHOOKS).toBe(true);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("FEATURE_DIGESTS");
    expect(lines[0]).not.toContain("TOP-SECRET-yes");
    expect(lines[0]).not.toContain("re_secret");
  });

  it("treats a non-string binding as off", () => {
    const { lines, logger } = capture();
    const flags = readFlags({ FEATURE_DARK_MODE: true }, logger);
    expect(flags.FEATURE_DARK_MODE).toBe(false);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("FEATURE_DARK_MODE");
  });

  it("never leaks an arbitrary invalid value into the logs", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...FLAG_NAMES),
        fc.string({ minLength: 1 }).map((s) => `~val~${s}`),
        (name, value) => {
          const { lines, logger } = capture();
          const flags = readFlags({ [name]: value }, logger);
          expect(flags[name]).toBe(false);
          expect(lines).toHaveLength(1);
          expect(lines[0]).toContain(name);
          expect(lines[0]).not.toContain("~val~");
        },
      ),
      { numRuns: 100 },
    );
  });
});
