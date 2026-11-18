import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/App";
import { runAxe } from "./axe";
import { apiError, json, NORMAL, STALE, stubFetch } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
});

describe("a11y: full app shell (header, nav, main, footer)", () => {
  it("has no violations at / when signed out, checked on the whole document body", async () => {
    window.history.pushState({}, "", "/");
    stubFetch({
      "GET /api/status/national": () => json(NORMAL),
      "GET /api/watchlist": () => apiError(401, "unauthorized", "Sign in required."),
    });
    render(<App />);
    await screen.findByRole("link", { name: "Sign in" });
    await screen.findByText("New York JFK");
    expect(await runAxe(document.body)).toHaveNoViolations();
  });

  it("has no violations at / with the stale banner while signed in", async () => {
    stubFetch({
      "GET /api/status/national": () => json(STALE),
      "GET /api/watchlist": () => json({ watchlist: [] }),
    });
    render(<App />);
    await screen.findByRole("button", { name: "Sign out" });
    await screen.findByTestId("stale-data-banner");
    expect(await runAxe(document.body)).toHaveNoViolations();
  });

  it("has no violations at an unknown path", async () => {
    window.history.pushState({}, "", "/nope");
    stubFetch({ "GET /api/watchlist": () => apiError(401, "unauthorized", "Sign in required.") });
    render(<App />);
    await screen.findByRole("link", { name: "Sign in" });
    expect(await runAxe(document.body)).toHaveNoViolations();
  });
});
