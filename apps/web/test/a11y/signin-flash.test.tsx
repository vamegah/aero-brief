import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SIGNIN_EMAIL_KEY } from "../../src/lib/signin-flash";
import { WatchlistPage } from "../../src/pages/WatchlistPage";
import { runAxe } from "./axe";
import { json, NORMAL, stubFetch } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("a11y: sign-in success message", () => {
  it("has no violations with the message shown", async () => {
    window.sessionStorage.setItem(SIGNIN_EMAIL_KEY, "pilot@example.com");
    window.history.replaceState(null, "", "/watchlist?signin=success");
    stubFetch({
      "GET /api/status/national": () => json(NORMAL),
      "GET /api/watchlist": () => json({ watchlist: ["JFK"] }),
    });
    const { container } = render(<WatchlistPage />);
    await screen.findByText("Successfully signed in as pilot@example.com.");
    await screen.findByRole("button", { name: "Remove New York JFK from watchlist" });
    expect(await runAxe(container)).toHaveNoViolations();
  });
});
