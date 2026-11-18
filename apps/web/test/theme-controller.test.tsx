import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeaturesContext } from "../src/features/use-features";
import { ALL_FLAGS_OFF, type Features } from "../src/features/features-schema";
import { THEME_CHANGE_EVENT, ThemeController } from "../src/theme/ThemeController";

type Listener = () => void;

/** Installs a controllable matchMedia. Returns a setter that fires `change` listeners. */
function stubMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<Listener>();
  const mql = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_t: string, l: Listener) => listeners.add(l),
    removeEventListener: (_t: string, l: Listener) => listeners.delete(l),
  };
  vi.stubGlobal("matchMedia", () => mql);
  return {
    set(next: boolean) {
      matches = next;
      listeners.forEach((l) => l());
    },
    count: () => listeners.size,
  };
}

const ON: Features = { ...ALL_FLAGS_OFF, darkMode: true };
const theme = () => document.documentElement.dataset.theme;

function mount(features: Features) {
  const ui = (f: Features) => (
    <FeaturesContext.Provider value={f}>
      <ThemeController />
    </FeaturesContext.Provider>
  );
  const view = render(ui(features));
  return { ...view, setFeatures: (f: Features) => view.rerender(ui(f)) };
}

describe("ThemeController", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it.each([
    ["dark", false, "dark"],
    ["dark", true, "dark"],
    ["light", true, undefined],
    ["light", false, undefined],
    ["system", true, "dark"],
    ["system", false, undefined],
  ])("stored %s with system dark=%s gives %s", (stored, systemDark, expected) => {
    stubMatchMedia(systemDark);
    localStorage.setItem("aerobrief.theme", stored);
    mount(ON);
    expect(theme()).toBe(expected);
  });

  it.each([[null], ["purple"], [""], ["DARK"]])("treats %j as system", (stored) => {
    stubMatchMedia(true);
    if (stored !== null) localStorage.setItem("aerobrief.theme", stored);
    mount(ON);
    expect(theme()).toBe("dark");
  });

  it("invalid value with a light system leaves the attribute off", () => {
    stubMatchMedia(false);
    localStorage.setItem("aerobrief.theme", "bogus");
    mount(ON);
    expect(theme()).toBeUndefined();
  });

  it("follows a matchMedia change while the preference is system", () => {
    const mm = stubMatchMedia(false);
    mount(ON);
    expect(theme()).toBeUndefined();
    act(() => mm.set(true));
    expect(theme()).toBe("dark");
    act(() => mm.set(false));
    expect(theme()).toBeUndefined();
  });

  it("ignores a matchMedia change when the preference is explicit", () => {
    const mm = stubMatchMedia(false);
    localStorage.setItem("aerobrief.theme", "light");
    mount(ON);
    act(() => mm.set(true));
    expect(theme()).toBeUndefined();
  });

  it("re-resolves on the theme change event", () => {
    stubMatchMedia(false);
    mount(ON);
    localStorage.setItem("aerobrief.theme", "dark");
    act(() => {
      window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    });
    expect(theme()).toBe("dark");
  });

  it("survives a throwing localStorage and falls back to system", () => {
    stubMatchMedia(true);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    mount(ON);
    expect(theme()).toBe("dark");
  });

  it("removes the attribute and listeners on unmount", () => {
    const mm = stubMatchMedia(true);
    const { unmount } = mount(ON);
    expect(theme()).toBe("dark");
    expect(mm.count()).toBe(1);
    unmount();
    expect(theme()).toBeUndefined();
    expect(mm.count()).toBe(0);
  });

  it("removes the attribute when the flag turns off at runtime", () => {
    stubMatchMedia(true);
    const { setFeatures } = mount(ON);
    expect(theme()).toBe("dark");
    setFeatures(ALL_FLAGS_OFF);
    expect(theme()).toBeUndefined();
  });

  it("flag off: no storage read, no write, no attribute, no listeners", () => {
    const mm = stubMatchMedia(true);
    localStorage.setItem("aerobrief.theme", "dark");
    const get = vi.spyOn(Storage.prototype, "getItem");
    const set = vi.spyOn(Storage.prototype, "setItem");
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    const { container } = mount(ALL_FLAGS_OFF);
    act(() => {
      window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    });
    expect(container.innerHTML).toBe("");
    expect(theme()).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(mm.count()).toBe(0);
  });

  it("flag off without a provider renders nothing", () => {
    render(<ThemeController />);
    expect(theme()).toBeUndefined();
  });

  it("never writes to local storage while on", () => {
    stubMatchMedia(true);
    const set = vi.spyOn(Storage.prototype, "setItem");
    mount(ON);
    expect(set).not.toHaveBeenCalled();
  });
});

describe("ThemeController contrast preference", () => {
  const HC: Features = { ...ALL_FLAGS_OFF, highContrast: true };
  const BOTH: Features = { ...ALL_FLAGS_OFF, darkMode: true, highContrast: true };
  const getKeys = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => c[0]);

  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("stored high with darkMode off gives hc-light", () => {
    localStorage.setItem("aerobrief.contrast", "high");
    mount(HC);
    expect(theme()).toBe("hc-light");
  });

  it("darkMode on, stored theme dark and contrast high gives hc-dark", () => {
    stubMatchMedia(false);
    localStorage.setItem("aerobrief.theme", "dark");
    localStorage.setItem("aerobrief.contrast", "high");
    mount(BOTH);
    expect(theme()).toBe("hc-dark");
  });

  it.each([["standard"], ["purple"], [""], ["HIGH"]])("contrast value %j gives no hc variant", (v) => {
    localStorage.setItem("aerobrief.contrast", v);
    mount(HC);
    expect(theme()).toBeUndefined();
  });

  it("highContrast off: the contrast key is never read", () => {
    stubMatchMedia(true);
    localStorage.setItem("aerobrief.contrast", "high");
    const get = vi.spyOn(Storage.prototype, "getItem");
    mount(ON);
    expect(getKeys(get)).not.toContain("aerobrief.contrast");
    expect(theme()).toBe("dark");
  });

  it("highContrast off with standard stored matches the dark-only output", () => {
    stubMatchMedia(true);
    localStorage.setItem("aerobrief.contrast", "standard");
    mount(ON);
    expect(theme()).toBe("dark");
  });

  it("darkMode off: the theme key is never read and the dark query is never used", () => {
    const mm = vi.fn(() => ({
      matches: true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    vi.stubGlobal("matchMedia", mm);
    localStorage.setItem("aerobrief.theme", "dark");
    localStorage.setItem("aerobrief.contrast", "high");
    const get = vi.spyOn(Storage.prototype, "getItem");
    mount(HC);
    expect(getKeys(get)).not.toContain("aerobrief.theme");
    expect(mm).not.toHaveBeenCalled();
    expect(theme()).toBe("hc-light");
  });

  it("never queries prefers-contrast", () => {
    const mm = vi.fn(() => ({
      matches: true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    vi.stubGlobal("matchMedia", mm);
    localStorage.setItem("aerobrief.contrast", "high");
    mount(BOTH);
    mount(HC);
    const queries = (mm.mock.calls as unknown as unknown[][]).map((c) => String(c[0]));
    expect(queries.some((q) => q.includes("prefers-contrast"))).toBe(false);
  });

  it("re-resolves the contrast on the theme change event", () => {
    mount(HC);
    expect(theme()).toBeUndefined();
    localStorage.setItem("aerobrief.contrast", "high");
    act(() => {
      window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    });
    expect(theme()).toBe("hc-light");
  });

  it("both flags off: no attribute and nothing read", () => {
    localStorage.setItem("aerobrief.contrast", "high");
    const get = vi.spyOn(Storage.prototype, "getItem");
    const { container } = mount(ALL_FLAGS_OFF);
    expect(container.innerHTML).toBe("");
    expect(theme()).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });

  it("removes the attribute on unmount with only highContrast on", () => {
    localStorage.setItem("aerobrief.contrast", "high");
    const { unmount } = mount(HC);
    expect(theme()).toBe("hc-light");
    unmount();
    expect(theme()).toBeUndefined();
  });
});
