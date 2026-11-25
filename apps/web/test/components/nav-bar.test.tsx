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

async function openAccountMenu(): Promise<HTMLElement> {
  const button = await screen.findByRole("button", { name: "Account" });
  fireEvent.click(button);
  return button;
}

describe("NavBar", () => {
  it("links to Status, Watchlist and Settings, and offers Sign in as a separate button-styled link when signed out", async () => {
    stubFetch(SIGNED_OUT);
    render(<NavBar pathname="/" />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).toBeTruthy();
    expect(screen.getByRole("link", { name: "Status" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Watchlist" }).getAttribute("href")).toBe("/watchlist");
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
    const signIn = await screen.findByRole("link", { name: "Sign in" });
    expect(signIn.getAttribute("href")).toBe("/sign-in");
    expect(signIn.classList.contains("btn")).toBe(true);
    expect(signIn.closest("li")?.classList.contains("nav-bar__auth")).toBe(true);
    expect(screen.queryByRole("button", { name: "Account" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("shows an account menu instead of Sign in when signed in, with Sign out inside it and Settings as a top-level link", async () => {
    stubFetch(SIGNED_IN);
    render(<NavBar pathname="/watchlist" />);
    const account = await screen.findByRole("button", { name: "Account" });
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(account.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
    fireEvent.click(account);
    expect(account.getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById(account.getAttribute("aria-controls") ?? "");
    expect(panel?.contains(screen.getByRole("button", { name: "Sign out" }))).toBe(true);
    expect(panel?.contains(screen.getByRole("link", { name: "Settings" }))).toBe(false);
  });

  it("signing out from the account menu calls logout then returns to /", async () => {
    const fetchMock = stubFetch({ ...SIGNED_IN, "POST /api/auth/logout": () => json({ ok: true }) });
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    render(<NavBar pathname="/watchlist" />);
    await openAccountMenu();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
    expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/auth/logout" && init?.method === "POST")).toBe(true);
  });

  it("Escape closes the account menu and returns focus to its button", async () => {
    stubFetch(SIGNED_IN);
    render(<NavBar pathname="/" />);
    const account = await openAccountMenu();
    const signOut = screen.getByRole("button", { name: "Sign out" });
    signOut.focus();
    fireEvent.keyDown(signOut, { key: "Escape" });
    expect(account.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(document.activeElement).toBe(account);
  });

  it("closes the account menu on a press outside it, but not inside it", async () => {
    stubFetch(SIGNED_IN);
    render(<NavBar pathname="/" />);
    const account = await openAccountMenu();
    fireEvent.mouseDown(screen.getByRole("button", { name: "Sign out" }));
    expect(account.getAttribute("aria-expanded")).toBe("true");
    fireEvent.mouseDown(document.body);
    expect(account.getAttribute("aria-expanded")).toBe("false");
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

  it("marks the Settings link as the current page on /settings", async () => {
    stubFetch(SIGNED_IN);
    render(<NavBar pathname="/settings" />);
    await screen.findByRole("button", { name: "Account" });
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("aria-current")).toBe("page");
  });

  it("has a Menu toggle that controls the link list, collapsed until pressed", async () => {
    stubFetch(SIGNED_OUT);
    render(<NavBar pathname="/" />);
    await screen.findByRole("link", { name: "Sign in" });
    const toggle = screen.getByRole("button", { name: "Menu" });
    const list = document.getElementById(toggle.getAttribute("aria-controls") ?? "") as HTMLElement;
    expect(list.tagName).toBe("UL");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(list.classList.contains("nav-bar__list--collapsed")).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(list.classList.contains("nav-bar__list--collapsed")).toBe(false);
    fireEvent.keyDown(screen.getByRole("link", { name: "Status" }), { key: "Escape" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });

  it("makes every control keyboard reachable (native links and buttons)", async () => {
    stubFetch(SIGNED_IN);
    render(<NavBar pathname="/" />);
    await openAccountMenu();
    const nav = screen.getByRole("navigation", { name: "Main" });
    const controls = nav.querySelectorAll("a[href], button");
    // Menu toggle, Status, Watchlist, Account, Settings, Sign out.
    expect(controls.length).toBe(6);
    controls.forEach((el) => expect(el.getAttribute("tabindex")).not.toBe("-1"));
  });
});
