import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "../../src/pages/SettingsPage";
import { WatchlistPage } from "../../src/pages/WatchlistPage";
import { runAxe } from "./axe";
import { apiError, json, NORMAL, stubFetch, type Routes } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = "";
});

function routes(extra: Routes = {}): Routes {
  return {
    "GET /api/status/national": () => json(NORMAL),
    "GET /api/watchlist": () => json({ watchlist: ["JFK"] }),
    ...extra,
  };
}

/** Renders the Settings page on the Account section and waits until the session has loaded. */
async function renderAccount() {
  window.location.hash = "#account";
  const view = render(<SettingsPage />);
  await screen.findByRole("button", { name: "Delete account" });
  return view;
}

/** Renders the page and waits until the status table and the saved list have loaded. */
async function renderLoaded() {
  const view = render(<WatchlistPage />);
  await screen.findByRole("button", { name: "Remove New York JFK from watchlist" });
  return view;
}

describe("a11y: watchlist management", () => {
  it("has no violations with watched and not-watched airports", async () => {
    stubFetch(routes());
    const { container } = await renderLoaded();
    expect(screen.getAllByText("Not watching").length).toBeGreaterThan(0);
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations when adding an airport is rejected", async () => {
    stubFetch(
      routes({
        "POST /api/watchlist": () => apiError(409, "watchlist_full", "Your watchlist is full (10 airports)."),
      }),
    );
    const { container } = await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: "Add Atlanta Hartsfield-Jackson to watchlist" }));
    await screen.findByText("Your watchlist is full (10 airports).");
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations in the account deletion confirmation state (Settings #account)", async () => {
    stubFetch(routes());
    const { container } = await renderAccount();
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    await screen.findByRole("group", { name: "Confirm account deletion" });
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations when account deletion fails (Settings #account)", async () => {
    stubFetch(
      routes({ "DELETE /api/account": () => apiError(500, "internal", "Could not delete your account. Try again.") }),
    );
    const { container } = await renderAccount();
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm delete account" }));
    await screen.findByText("Could not delete your account. Try again.");
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations when the user is signed out", async () => {
    stubFetch(routes({ "GET /api/watchlist": () => apiError(401, "unauthorized", "Not signed in.") }));
    const { container } = render(<WatchlistPage />);
    await screen.findByText("Sign in to see your watchlist.");
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations when the watchlist fails to load", async () => {
    stubFetch(routes({ "GET /api/watchlist": () => apiError(500, "internal", "Could not load your watchlist. Try again.") }));
    const { container } = render(<WatchlistPage />);
    await screen.findByText("Could not load your watchlist. Try again.");
    expect(await runAxe(container)).toHaveNoViolations();
  });
});
