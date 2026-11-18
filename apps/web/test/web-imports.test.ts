import { describe, expect, it } from "vitest";

const sources = import.meta.glob("../src/**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("web imports", () => {
  it("scans source files", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(0);
  });

  it('never imports the "@aerobrief/core" index (use subpaths such as "@aerobrief/core/theme")', () => {
    const offenders = Object.entries(sources)
      .filter(([, text]) => /from\s+["']@aerobrief\/core["']/.test(text))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
