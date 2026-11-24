import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionMenu } from "../../src/components/SectionMenu";

const ITEMS = [
  { id: "one", label: "First" },
  { id: "two", label: "Second" },
  { id: "three", label: "Third" },
];

describe("SectionMenu", () => {
  it("renders a labelled nav with ordered hash links and one aria-current", () => {
    render(<SectionMenu ariaLabel="Test sections" items={ITEMS} active="two" />);
    const nav = screen.getByRole("navigation", { name: "Test sections" });
    expect(nav.classList.contains("section-menu")).toBe(true);
    const links = within(nav).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual(["First", "Second", "Third"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["#one", "#two", "#three"]);
    const current = links.filter((a) => a.getAttribute("aria-current") === "true");
    expect(current.map((a) => a.textContent)).toEqual(["Second"]);
  });

  it("adds the extra class next to section-menu", () => {
    render(<SectionMenu ariaLabel="X" items={ITEMS} active="one" className="extra-menu" />);
    const nav = screen.getByRole("navigation", { name: "X" });
    expect(nav.classList.contains("section-menu")).toBe(true);
    expect(nav.classList.contains("extra-menu")).toBe(true);
  });

  it("Tab order follows DOM order: native links, no positive tabindex", () => {
    const { container } = render(<SectionMenu ariaLabel="X" items={ITEMS} active="one" />);
    const focusable = Array.from(container.querySelectorAll<HTMLElement>("a[href], [tabindex]"));
    expect(focusable.map((el) => el.textContent)).toEqual(["First", "Second", "Third"]);
    expect(focusable.every((el) => !el.hasAttribute("tabindex"))).toBe(true);
  });
});
