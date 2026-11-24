import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavBar } from "../../src/components/NavBar";
import { runAxe } from "./axe";
import { apiError, json, stubFetch } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a11y: site navigation bar", () => {
  it("has no violations when signed out", async () => {
    stubFetch({ "GET /api/watchlist": () => apiError(401, "unauthorized", "Sign in required.") });
    const { container } = render(<NavBar pathname="/" />);
    await screen.findByRole("link", { name: "Sign in" });
    expect(await runAxe(container)).toHaveNoViolations();
  });

  it("has no violations when signed in", async () => {
    stubFetch({ "GET /api/watchlist": () => json({ watchlist: [] }) });
    const { container } = render(<NavBar pathname="/watchlist" />);
    await screen.findByRole("button", { name: "Sign out" });
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
    expect(await runAxe(container)).toHaveNoViolations();
  });
});
