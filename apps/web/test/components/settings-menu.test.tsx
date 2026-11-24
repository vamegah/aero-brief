import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsMenu } from "../../src/components/SettingsMenu";
import { SECTION_IDS, SECTION_LABELS } from "../../src/lib/settings-sections";

afterEach(cleanup);

describe("SettingsMenu", () => {
  it("renders a labelled nav with a list of links in the given order", () => {
    render(<SettingsMenu sections={SECTION_IDS} active="display" />);
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(nav.classList.contains("settings-menu")).toBe(true);
    const links = within(nav).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual(SECTION_IDS.map((id) => SECTION_LABELS[id]));
    expect(links.map((a) => a.getAttribute("href"))).toEqual(SECTION_IDS.map((id) => `#${id}`));
    expect(within(nav).getAllByRole("listitem")).toHaveLength(SECTION_IDS.length);
  });

  it("renders only the sections it is given", () => {
    render(<SettingsMenu sections={["account"]} active="account" />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe("#account");
  });

  it("marks only the active link with aria-current=true", () => {
    render(<SettingsMenu sections={SECTION_IDS} active="webhooks" />);
    const current = screen.getAllByRole("link").filter((a) => a.hasAttribute("aria-current"));
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toBe("Webhooks");
    expect(current[0]?.getAttribute("aria-current")).toBe("true");
  });

  it("keeps links in DOM order, all focusable, and none removed from the Tab order", () => {
    render(<SettingsMenu sections={SECTION_IDS} active="display" />);
    const links = screen.getAllByRole("link");
    for (const a of links) {
      expect(a.getAttribute("tabindex")).not.toBe("-1");
      expect(a.hasAttribute("tabindex")).toBe(false);
      a.focus();
      expect(document.activeElement).toBe(a);
    }
    const domOrder = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(domOrder).toEqual(links.map((a) => a.getAttribute("href")));
  });
});
