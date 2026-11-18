import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusPill } from "../../src/components/StatusPill";

describe("StatusPill", () => {
  it.each([
    ["active", "Ground stop"],
    ["normal", "No ground stop reported"],
  ] as const)("shows the %s status as text with an aria-hidden icon", (variant, text) => {
    const { container } = render(<StatusPill variant={variant} text={text} />);
    const pill = container.firstElementChild as HTMLElement;
    expect(pill.textContent).toBe(text);
    expect(pill.className).toContain(`status-pill--${variant}`);
    expect(pill.querySelector("span.icon[aria-hidden='true']")).not.toBeNull();
    expect(pill.querySelector("svg, img")).toBeNull();
  });
});
