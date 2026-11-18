import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Banner } from "../../src/components/Banner";

describe("Banner", () => {
  it.each(["stale", "nationwide", "error"] as const)("renders the %s variant with exactly its text", (variant) => {
    render(
      <Banner variant={variant} data-testid="b">
        Something happened.
      </Banner>,
    );
    const banner = screen.getByTestId("b");
    expect(banner.className).toContain(`ui-banner--${variant}`);
    expect(banner.textContent).toBe("Something happened.");
    expect(banner.querySelector("span.icon[aria-hidden='true']")).not.toBeNull();
  });

  it("adds no role or aria-live of its own", () => {
    const { container } = render(<Banner variant="error">Oops</Banner>);
    expect(container.querySelector("[role], [aria-live]")).toBeNull();
  });
});
