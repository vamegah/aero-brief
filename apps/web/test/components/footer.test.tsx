import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Footer } from "../../src/components/Footer";

afterEach(cleanup);

describe("Footer", () => {
  it("renders a contentinfo footer with the links, the notice and the attribution", () => {
    render(<Footer />);
    const footer = screen.getByRole("contentinfo");
    expect(footer.tagName).toBe("FOOTER");
    expect(footer.textContent).toContain("API documentation");
    expect(footer.textContent).toContain("FAA NAS Status");
    expect(footer.textContent).toContain("Information is advisory and not for operational flight decisions.");
    expect(footer.textContent).toContain("MIT");
    expect(footer.textContent).toContain("Built with Kiro · Kiroween 2026");
  });

  it("links the API docs, the data source and the license with real hrefs", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: /^API documentation/ }).getAttribute("href")).toBe(
      "https://github.com/vamegah/aero-brief/blob/main/docs/api.md",
    );
    expect(screen.getByRole("link", { name: /^FAA NAS Status/ }).getAttribute("href")).toBe(
      "https://nasstatus.faa.gov/",
    );
    expect(screen.getByRole("link", { name: /^MIT/ }).getAttribute("href")).toBe(
      "https://github.com/vamegah/aero-brief/blob/main/LICENSE",
    );
  });

  it("opens every external link in a new tab, safely, with an accessible hint", () => {
    render(<Footer />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
    for (const link of links) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(link.textContent).toContain("(opens in a new tab)");
    }
  });

  it("ships without Terms and Privacy links", () => {
    render(<Footer />);
    expect(screen.queryByRole("link", { name: /terms|privacy/i })).toBeNull();
  });

  it("puts the license and attribution in a secondary line after the notice", () => {
    render(<Footer />);
    const secondary = document.querySelector(".site-footer__secondary");
    expect(secondary?.textContent).toContain("MIT");
    expect(secondary?.textContent).toContain("Kiroween 2026");
    const notice = document.querySelector(".site-footer__notice");
    expect(notice?.compareDocumentPosition(secondary as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
