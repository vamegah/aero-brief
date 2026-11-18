import { describe, expect, test } from "vitest";
import { parseFlags } from "../src/flags";

const ALL_OFF = {
  FEATURE_DARK_MODE: false,
  FEATURE_HIGH_CONTRAST: false,
  FEATURE_DIGESTS: false,
  FEATURE_WEBHOOKS: false,
};

describe("parseFlags", () => {
  test("empty input gives all off and no warnings", () => {
    expect(parseFlags({})).toEqual({ flags: ALL_OFF, warnings: [] });
  });

  test("undefined values are absent, not invalid", () => {
    expect(parseFlags({ FEATURE_DIGESTS: undefined })).toEqual({ flags: ALL_OFF, warnings: [] });
  });

  test("true and false map to booleans", () => {
    const { flags, warnings } = parseFlags({
      FEATURE_DARK_MODE: "true",
      FEATURE_HIGH_CONTRAST: "false",
      FEATURE_DIGESTS: "true",
      FEATURE_WEBHOOKS: "false",
    });
    expect(flags).toEqual({
      FEATURE_DARK_MODE: true,
      FEATURE_HIGH_CONTRAST: false,
      FEATURE_DIGESTS: true,
      FEATURE_WEBHOOKS: false,
    });
    expect(warnings).toEqual([]);
  });

  test("one flag on leaves the others off", () => {
    expect(parseFlags({ FEATURE_WEBHOOKS: "true" }).flags).toEqual({ ...ALL_OFF, FEATURE_WEBHOOKS: true });
  });

  test.each(["TRUE", "True", " true", "true ", "1", "yes", "on", ""])(
    "invalid value %j is off with one warning that omits the value",
    (value) => {
      const { flags, warnings } = parseFlags({ FEATURE_DARK_MODE: value });
      expect(flags.FEATURE_DARK_MODE).toBe(false);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("FEATURE_DARK_MODE");
      if (value.trim() !== "") expect(warnings[0]).not.toContain(value.trim());
    },
  );

  test("an invalid flag does not affect a valid one", () => {
    const { flags, warnings } = parseFlags({ FEATURE_DIGESTS: "maybe", FEATURE_WEBHOOKS: "true" });
    expect(flags).toEqual({ ...ALL_OFF, FEATURE_WEBHOOKS: true });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("FEATURE_DIGESTS");
  });

  test("unrelated keys are ignored and inherited keys are not read", () => {
    expect(parseFlags({ NODE_ENV: "x", FEATURE_OTHER: "true" })).toEqual({ flags: ALL_OFF, warnings: [] });
  });
});
