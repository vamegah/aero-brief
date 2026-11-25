import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/App";
import { FeaturesProvider } from "../../src/features/FeaturesProvider";

const TAGLINE = "Ground stops and system-wide disruptions at 30 major US airports.";

function stubFetch(): void {
  vi.stubGlobal("fetch", () =>
    Promise.resolve(new Response("{}", { status: 401, headers: { "content-type": "application/json" } })),
  );
}

function renderAt(path: string): HTMLElement {
  window.history.pushState({}, "", path);
  const { container } = render(
    <FeaturesProvider>
      <App />
    </FeaturesProvider>,
  );
  return container;
}

describe("App shell headings", () => {
  beforeEach(stubFetch);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.history.pushState({}, "", "/");
  });

  it.each(["/", "/watchlist", "/settings", "/no-such-page"])(
    "%s has one h1 'AeroBrief' in the header and none in main",
    (path) => {
      const container = renderAt(path);
      const h1s = screen.getAllByRole("heading", { level: 1 });
      expect(h1s).toHaveLength(1);
      expect(h1s[0]?.textContent).toBe("AeroBrief");
      expect(h1s[0]?.closest("header.site-header")).not.toBeNull();
      const main = container.querySelector("main");
      expect(main?.querySelector("h1")).toBeNull();
      if (path !== "/") expect(main?.textContent).not.toContain(TAGLINE);
    },
  );

  it("shows the tagline as the Status page subtitle", () => {
    const container = renderAt("/");
    const subtitle = container.querySelector("main .page-header__subtitle");
    expect(subtitle?.textContent).toBe(TAGLINE);
  });
});
