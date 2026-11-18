import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/App";
import { json, NORMAL, stubFetch } from "../a11y/fixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
});

describe("shared watchlist request", () => {
  it("sends exactly one GET /api/watchlist when /watchlist loads", async () => {
    window.history.pushState({}, "", "/watchlist");
    const fetchMock = stubFetch({
      "GET /api/watchlist": () => json({ watchlist: ["JFK"] }),
      "GET /api/status/national": () => json(NORMAL),
    });
    render(<App />);

    await screen.findByRole("button", { name: "Sign out" });
    await screen.findByRole("button", { name: "Remove New York JFK from watchlist" });

    const watchlistCalls = fetchMock.mock.calls.filter(([input]) => String(input) === "/api/watchlist");
    expect(watchlistCalls).toHaveLength(1);
  });
});
