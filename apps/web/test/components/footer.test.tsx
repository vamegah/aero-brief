import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Footer } from "../../src/components/Footer";

afterEach(cleanup);

describe("Footer", () => {
  it("renders a contentinfo footer with the three attributions", () => {
    render(<Footer />);
    const footer = screen.getByRole("contentinfo");
    expect(footer.tagName).toBe("FOOTER");
    expect(footer.textContent).toContain("FAA NAS Status API");
    expect(footer.textContent).toContain("MIT");
    expect(footer.textContent).toContain("Built with Kiro · Kiroween 2026");
  });

  it("links the data source and license with real hrefs", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "FAA NAS Status API" }).getAttribute("href")).toBe(
      "https://nasstatus.faa.gov",
    );
    expect(screen.getByRole("link", { name: "MIT" }).getAttribute("href")).toBe(
      "https://github.com/vamegah/aero-brief/blob/main/LICENSE",
    );
  });
});
