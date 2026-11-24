import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavBar } from "../../src/components/NavBar";
import { apiError, json, stubFetch } from "../a11y/fixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SIGNED_IN = { "GET /api/watchlist": () => json({ watchlist: ["JFK"] }) };
const SIGNED_OUT = { "GET /api/watchlist": () => apiError(401, "unauthorized", "Sign in required.") };

describe("NavBar", () => {
  it("links to Status and Watchlist, and offers Sign in when signed out", async () => {
    stubFetch(SIGNED_OUT);
    render(<NavBar pathname="/" />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).toBeTruthy();
    expect(screen.getByRole("link", { name: "Status" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Watchlist" }).getAttribute("href")).toBe("/watchlist");
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
    expect((await screen.findByRole("link", { name: "Sign in" })).getAttribute("href")).toBe("/sign-in");
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("shows Sign out instead of Sign in when signed in, and calls logout then returns to /", async () => {
    const fetchMock = stubFetch({ ...SIGNED_IN, "POST /api/auth/logout": () => json({ ok: true }) });
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    render(<NavBar pathname="/watchlist" />);
    const button = await screen.findByRole("button", { name: "Sign out" });
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    fireEvent.click(button);
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
    expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/auth/logout" && init?.method === "POST")).toBe(true);
  });

  it("marks only the current page with aria-current", async () => {
    stubFetch(SIGNED_OUT);
    render(<NavBar pathname="/watchlist" />);
    await screen.findByRole("link", { name: "Sign in" });
    expect(screen.getByRole("link", { name: "Watchlist" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Status" }).getAttribute("aria-current")).toBeNull();
    cleanup();
    stubFetch(SIGNED_OUT);
    render(<NavBar pathname="/sign-in" />);
    expect((await screen.findByRole("link", { name: "Sign in" })).getAttribute("aria-current")).toBe("page");
  });

  it("makes every control keyboard reachable (native links and button)", async () => {
    stubFetch(SIGNED_IN);
    render(<NavBar pathname="/" />);
    await screen.findByRole("button", { name: "Sign out" });
    const nav = screen.getByRole("navigation", { name: "Main" });
    const controls = nav.querySelectorAll("a[href], button");
    expect(controls.length).toBe(4);
    controls.forEach((el) => expect(el.getAttribute("tabindex")).not.toBe("-1"));
  });
});
