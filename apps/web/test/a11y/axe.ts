import { configureAxe } from "vitest-axe";

/** WCAG 2.1 level A and AA rules (Requirement 13.6). */
export const WCAG_21_AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const axe = configureAxe({
  runOnly: { type: "tag", values: WCAG_21_AA_TAGS },
  rules: {
    // jsdom has no layout or computed colors, so axe cannot evaluate color-contrast here. Contrast is
    // enforced by the palette unit test (test/contrast.test.ts, task 10.9). Every other rule stays on.
    "color-contrast": { enabled: false },
  },
});

/** Runs axe on `container`; assert the result with `toHaveNoViolations()`. Any violation fails. */
export function runAxe(container: Element) {
  return axe(container);
}
