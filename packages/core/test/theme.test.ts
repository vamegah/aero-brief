import { describe, expect, it } from "vitest";
import { resolveTheme, type ThemeInput, type ThemeVariant } from "../src/theme";

const base: ThemeInput = {
  darkFlag: false,
  contrastFlag: false,
  storedTheme: null,
  storedContrast: null,
  systemDark: false,
};
const r = (o: Partial<ThemeInput>): ThemeVariant => resolveTheme({ ...base, ...o });

describe("resolveTheme", () => {
  it("both flags off returns light whatever is stored", () => {
    for (const storedTheme of [null, "dark", "light", "system", "x"])
      for (const systemDark of [true, false])
        expect(r({ storedTheme, storedContrast: "high", systemDark })).toBe("light");
  });

  it("dark flag on: stored light/dark win over system", () => {
    expect(r({ darkFlag: true, storedTheme: "light", systemDark: true })).toBe("light");
    expect(r({ darkFlag: true, storedTheme: "dark", systemDark: false })).toBe("dark");
  });

  it("dark flag on: system, null and unknown values follow systemDark", () => {
    for (const storedTheme of ["system", null, "", "DARK", "Light", "blue"]) {
      expect(r({ darkFlag: true, storedTheme, systemDark: true })).toBe("dark");
      expect(r({ darkFlag: true, storedTheme, systemDark: false })).toBe("light");
    }
  });

  it("contrast on with dark flag off is hc-light", () => {
    expect(r({ contrastFlag: true, storedContrast: "high", storedTheme: "dark", systemDark: true })).toBe("hc-light");
  });

  it("contrast on with dark flag on follows the resolved mode", () => {
    const c = { darkFlag: true, contrastFlag: true, storedContrast: "high" };
    expect(r({ ...c, storedTheme: "dark" })).toBe("hc-dark");
    expect(r({ ...c, storedTheme: "light", systemDark: true })).toBe("hc-light");
    expect(r({ ...c, storedTheme: null, systemDark: true })).toBe("hc-dark");
    expect(r({ ...c, storedTheme: "x", systemDark: false })).toBe("hc-light");
  });

  it("only the exact value high selects high contrast", () => {
    for (const storedContrast of ["standard", null, "", "High", "HIGH", " high", "true"])
      expect(r({ contrastFlag: true, storedContrast })).toBe("light");
    expect(r({ contrastFlag: true, storedContrast: "high" })).toBe("hc-light");
  });

  it("contrast flag off ignores stored high", () => {
    expect(r({ darkFlag: true, storedTheme: "dark", storedContrast: "high" })).toBe("dark");
  });

  it("never throws on malformed input", () => {
    expect(() => resolveTheme(undefined as unknown as ThemeInput)).not.toThrow();
    expect(resolveTheme(null as unknown as ThemeInput)).toBe("light");
    expect(resolveTheme({} as ThemeInput)).toBe("light");
    expect(resolveTheme({ ...base, darkFlag: true, storedTheme: 5 as unknown as string, systemDark: true })).toBe("dark");
  });
});
