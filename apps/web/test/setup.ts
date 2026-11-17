import { cleanup } from "@testing-library/react";
import { afterEach, expect } from "vitest";
import { toHaveNoViolations } from "vitest-axe/dist/matchers.js";

// Deep import on purpose: the package's `vitest-axe/matchers` entry types are `export type *`, which
// TS rejects as a value import (TS1362). `dist/matchers` declares the function as a real value.
// Registers `expect(results).toHaveNoViolations()` for the accessibility suite (test/a11y).
expect.extend({ toHaveNoViolations });

// Types the matcher. Vitest exposes custom matchers through its `Matchers` interface; the type
// parameters (names, constraint, defaults) must be identical to vitest's declaration to merge.
declare module "vitest" {
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> {
    /** Passes when an axe-core result contains no violations. */
    toHaveNoViolations(): R;
  }
}

// jsdom has no canvas, so `getContext` logs "Not implemented" and returns null. axe-core's
// `_isIconLigature` (label-content-name-mismatch) dereferences the context (`.canvas`) without a null
// check, so null is not safe. Return a minimal fake 2D context instead: constant text width and
// identical non-empty pixel data for the first char and the full text, which makes the function
// report "not a ligature" (false). Color contrast is covered by test/contrast.test.ts.
const fakeContext2d = (canvas: HTMLCanvasElement): unknown => ({
  canvas,
  font: "",
  textAlign: "left",
  textBaseline: "top",
  measureText: () => ({ width: 10 }),
  fillText: () => undefined,
  clearRect: () => undefined,
  getImageData: () => ({ data: new Uint8ClampedArray(4).fill(255) }),
});

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  writable: true,
  value: function getContext(this: HTMLCanvasElement, contextId: string): unknown {
    return contextId === "2d" ? fakeContext2d(this) : null;
  },
});

afterEach(() => {
  cleanup();
});
