import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { resolveTheme, type ThemeInput } from "../src/theme";

// Feature: aerobrief-phase2, Property 3: Features off or invalid input resolves to the MVP look
// **Validates: Requirements 8.3, 8.12, 9.3, 9.7**

const stored = fc.oneof(
  fc.constant(null),
  fc.constantFrom("light", "dark", "system", "high", "standard", ""),
  fc.string(),
);
const input = (darkFlag: boolean, contrastFlag: boolean) =>
  fc.record({
    darkFlag: fc.constant(darkFlag),
    contrastFlag: fc.constant(contrastFlag),
    storedTheme: stored,
    storedContrast: stored,
    systemDark: fc.boolean(),
  }) as fc.Arbitrary<ThemeInput>;
const anyInput = fc.record({
  darkFlag: fc.boolean(),
  contrastFlag: fc.boolean(),
  storedTheme: stored,
  storedContrast: stored,
  systemDark: fc.boolean(),
}) as fc.Arbitrary<ThemeInput>;

const isHc = (v: string) => v.startsWith("hc-");
const opts = { numRuns: 200 };

describe("Property 3: MVP look defaults", () => {
  it("both flags off resolves to light", () => {
    fc.assert(fc.property(input(false, false), (i) => resolveTheme(i) === "light"), opts);
  });

  it("dark flag on with invalid stored theme follows system; systemDark false gives light", () => {
    const invalid = stored.filter((s) => s !== "light" && s !== "dark");
    fc.assert(
      fc.property(input(true, false), invalid, (i, storedTheme) => {
        expect(resolveTheme({ ...i, storedTheme, systemDark: false })).toBe("light");
        expect(resolveTheme({ ...i, storedTheme, systemDark: true })).toBe("dark");
      }),
      opts,
    );
  });

  it("contrast flag on with stored contrast other than exactly 'high' is never hc-*", () => {
    const notHigh = stored.filter((s) => s !== "high");
    fc.assert(
      fc.property(input(true, true), notHigh, (i, storedContrast) =>
        !isHc(resolveTheme({ ...i, storedContrast })),
      ),
      opts,
    );
  });

  it("contrast flag off never resolves to hc-*", () => {
    fc.assert(fc.property(anyInput, (i) => !isHc(resolveTheme({ ...i, contrastFlag: false }))), opts);
  });

  it("dark flag off never resolves to dark or hc-dark", () => {
    fc.assert(
      fc.property(anyInput, (i) => {
        const v = resolveTheme({ ...i, darkFlag: false });
        return v !== "dark" && v !== "hc-dark";
      }),
      opts,
    );
  });
});
