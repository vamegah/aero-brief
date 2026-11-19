import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { filterAllowlisted } from "../src/safe-send";

// Feature: aerobrief-phase2, Property 5: Allowlist filter returns only allowlisted recipients
// **Validates: Requirements 5.7, 5.9**
describe("Property 5: Allowlist filter returns only allowlisted recipients", () => {
  const norm = (s: string) => s.trim().toLowerCase();
  const recipients = fc.array(fc.string({ maxLength: 20 }), { maxLength: 30 });

  it("returns an ordered sublist in which every item is on the allowlist", () => {
    fc.assert(
      fc.property(recipients, recipients, (items, allowlist) => {
        // Bias: mix some recipients into the allowlist so matches occur.
        const list = [...allowlist, ...items.filter((_, i) => i % 2 === 0)];
        const out = filterAllowlisted(items, list, (r) => r);
        const allowed = new Set(list.map(norm));
        expect(out.every((r) => allowed.has(norm(r)))).toBe(true);
        // sublist: order preserved
        let i = 0;
        for (const r of items) if (i < out.length && out[i] === r) i++;
        expect(i).toBe(out.length);
        // nothing allowlisted is dropped
        expect(out.length).toBe(items.filter((r) => allowed.has(norm(r))).length);
      }),
      { numRuns: 200 },
    );
  });

  it("returns an empty list when the allowlist is empty", () => {
    fc.assert(
      fc.property(recipients, (items) => {
        expect(filterAllowlisted(items, [], (r) => r)).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });
});
