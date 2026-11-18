import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { resolveTheme, type ThemeInput, type ThemeVariant } from "../src/theme";

// Feature: aerobrief-phase2, Property 2: Theme resolution is total
// **Validates: Requirements 8.11, 9.5, 9.6**

const VARIANTS: ThemeVariant[] = ["light", "dark", "hc-light", "hc-dark"];
const NUM_RUNS = 200;

const storedValue = fc.oneof(
  fc.constantFrom("system", "light", "dark", "high", "standard", ""),
  fc.string(),
  fc.constant(null),
  fc.anything(),
);
const flagValue = fc.oneof(fc.boolean(), fc.anything());

const fieldFuzzInput = fc.record({
  darkFlag: flagValue,
  contrastFlag: flagValue,
  storedTheme: storedValue,
  storedContrast: storedValue,
  systemDark: flagValue,
});

const wholeObjectFuzz = fc.oneof(
  fieldFuzzInput,
  fc.constant(null),
  fc.constant(undefined),
  fc.constant({}),
  fc.array(fc.anything()),
  fc.anything(),
);

const cast = (v: unknown) => v as ThemeInput;

describe("Property 2: Theme resolution is total", () => {
  it("never throws, returns one of four variants, and is deterministic", () => {
    fc.assert(
      fc.property(wholeObjectFuzz, (input) => {
        const a = resolveTheme(cast(input));
        const b = resolveTheme(cast(input));
        expect(VARIANTS).toContain(a);
        expect(b).toBe(a);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("with dark mode off, the result is light or hc-light", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.oneof(fc.string(), fc.constant(null)),
        fc.boolean(),
        fc.boolean(),
        fc.oneof(fc.string(), fc.constant(null)),
        (t, c, contrastFlag, systemDark, _x) => {
          const r = resolveTheme({
            darkFlag: false,
            contrastFlag,
            storedTheme: t,
            storedContrast: c,
            systemDark,
          });
          expect(["light", "hc-light"]).toContain(r);
          if (contrastFlag && c === "high") expect(r).toBe("hc-light");
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("with high contrast on and dark mode on, the result is hc- plus the resolved mode", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constantFrom("system", "light", "dark"), fc.string(), fc.constant(null)),
        fc.boolean(),
        (storedTheme, systemDark) => {
          const base = resolveTheme({
            darkFlag: true,
            contrastFlag: false,
            storedTheme,
            storedContrast: "high",
            systemDark,
          });
          const hc = resolveTheme({
            darkFlag: true,
            contrastFlag: true,
            storedTheme,
            storedContrast: "high",
            systemDark,
          });
          expect(["light", "dark"]).toContain(base);
          expect(hc).toBe(`hc-${base}`);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
