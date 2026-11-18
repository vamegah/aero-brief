import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/App";
import { ALL_FLAGS_OFF } from "../../src/features/features-schema";
import { FeaturesContext } from "../../src/features/use-features";
import { runAxe } from "./axe";
import { apiError } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
});

describe("a11y: App with the Display settings section visible", () => {
  it.each(["/", "/sign-in"])("has no violations at %s", async (path) => {
    window.history.pushState({}, "", path);
    vi.stubGlobal("fetch", () => Promise.resolve(apiError(401, "unauthorized", "Sign in required.")));
    render(
      <FeaturesContext.Provider value={{ ...ALL_FLAGS_OFF, darkMode: true }}>
        <App />
      </FeaturesContext.Provider>,
    );
    await screen.findByRole("region", { name: "Display settings" });
    await screen.findAllByRole("link", { name: "Sign in" });
    expect(await runAxe(document.body)).toHaveNoViolations();
  });

  it("has no violations with both flags on", async () => {
    window.history.pushState({}, "", "/");
    vi.stubGlobal("fetch", () => Promise.resolve(apiError(401, "unauthorized", "Sign in required.")));
    render(
      <FeaturesContext.Provider value={{ ...ALL_FLAGS_OFF, darkMode: true, highContrast: true }}>
        <App />
      </FeaturesContext.Provider>,
    );
    await screen.findByRole("checkbox", { name: "High contrast" });
    await screen.findAllByRole("link", { name: "Sign in" });
    expect(await runAxe(document.body)).toHaveNoViolations();
  });
});
