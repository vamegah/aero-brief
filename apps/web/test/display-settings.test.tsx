import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { ALL_FLAGS_OFF, type Features } from "../src/features/features-schema";
import { FeaturesContext } from "../src/features/use-features";
import { THEME_CHANGE_EVENT, THEME_KEY } from "../src/theme/ThemeController";
import { apiError } from "./a11y/fixtures";

const DARK_ON: Features = { ...ALL_FLAGS_OFF, darkMode: true };
const CONTRAST_ONLY: Features = { ...ALL_FLAGS_OFF, highContrast: true };

function mount(features: Features, path = "/") {
  window.history.pushState({}, "", path);
  return render(
    <FeaturesContext.Provider value={features}>
      <App />
    </FeaturesContext.Provider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  // Every API call answers 401; pages render a visible state and the settings section is unaffected.
  vi.stubGlobal("fetch", () => Promise.resolve(apiError(401, "unauthorized", "Sign in required.")));
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
});

describe("DisplaySettings", () => {
  it("shows a Display settings region with a Theme fieldset and three radios", () => {
    mount(DARK_ON);
    const region = screen.getByRole("region", { name: "Display settings" });
    expect(within(region).getByRole("heading", { level: 2, name: "Display settings" })).toBeTruthy();
    const group = within(region).getByRole("group", { name: "Theme" });
    expect(group.tagName).toBe("FIELDSET");
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => (r as HTMLInputElement).labels?.[0]?.textContent)).toEqual(["System", "Light", "Dark"]);
  });

  it("sits after main and before the footer, outside the nav bar", () => {
    mount(DARK_ON);
    const region = screen.getByRole("region", { name: "Display settings" });
    const main = screen.getByRole("main");
    const footer = screen.getByRole("contentinfo");
    expect(main.contains(region)).toBe(false);
    expect(screen.getByRole("navigation").contains(region)).toBe(false);
    expect(main.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(region.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("defaults to System and pre-selects the stored value", () => {
    const first = mount(DARK_ON);
    expect((screen.getByRole("radio", { name: "System" }) as HTMLInputElement).checked).toBe(true);
    first.unmount();
    localStorage.setItem(THEME_KEY, "light");
    mount(DARK_ON);
    expect((screen.getByRole("radio", { name: "Light" }) as HTMLInputElement).checked).toBe(true);
  });

  it("falls back to System for an invalid stored value", () => {
    localStorage.setItem(THEME_KEY, "purple");
    mount(DARK_ON);
    expect((screen.getByRole("radio", { name: "System" }) as HTMLInputElement).checked).toBe(true);
  });

  it("stores the choice and fires the change event when Dark is selected", () => {
    mount(DARK_ON);
    const onChange = vi.fn();
    window.addEventListener(THEME_CHANGE_EVENT, onChange);
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("radio", { name: "Dark" }) as HTMLInputElement).checked).toBe(true);
  });

  it("is usable by keyboard: radios are focusable native inputs and activation selects", () => {
    mount(DARK_ON);
    const light = screen.getByRole("radio", { name: "Light" }) as HTMLInputElement;
    expect(light.tagName).toBe("INPUT");
    expect(light.type).toBe("radio");
    expect(light.tabIndex).toBeGreaterThanOrEqual(0);
    act(() => light.focus());
    expect(document.activeElement).toBe(light);
    // jsdom does not turn Space or arrow keys into clicks; the browser does for native radios.
    fireEvent.click(light);
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
  });

  it("still fires the change event when storage throws", () => {
    mount(DARK_ON);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const onChange = vi.fn();
    window.addEventListener(THEME_CHANGE_EVENT, onChange);
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    vi.restoreAllMocks();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when both flags are off", () => {
    mount(ALL_FLAGS_OFF);
    expect(screen.queryByRole("region", { name: "Display settings" })).toBeNull();
    expect(screen.queryByText("Display settings")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("renders without a provider (all flags off)", () => {
    window.history.pushState({}, "", "/");
    render(<App />);
    expect(screen.queryByText("Display settings")).toBeNull();
  });

  it("shows the section without the Theme fieldset when only highContrast is on", () => {
    mount(CONTRAST_ONLY);
    expect(screen.getByRole("region", { name: "Display settings" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Theme" })).toBeNull();
  });

  it.each(["/", "/watchlist", "/sign-in", "/airport/ATL"])("is the same on %s", (path) => {
    mount(DARK_ON, path);
    const group = within(screen.getByRole("region", { name: "Display settings" })).getByRole("group", { name: "Theme" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
  });
});
