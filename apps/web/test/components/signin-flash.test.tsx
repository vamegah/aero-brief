import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeSigninFlash, SIGNIN_EMAIL_KEY } from "../../src/lib/signin-flash";
import { AuthCallbackPage } from "../../src/pages/AuthCallbackPage";
import { WatchlistPage } from "../../src/pages/WatchlistPage";
import { json, NORMAL, stubFetch } from "../a11y/fixtures";

const EMAIL = "pilot@example.com";
const MESSAGE = `Successfully signed in as ${EMAIL}.`;

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubWatchlistApi() {
  return stubFetch({
    "GET /api/status/national": () => json(NORMAL),
    "GET /api/watchlist": () => json({ watchlist: ["JFK"] }),
  });
}

describe("consumeSigninFlash", () => {
  it("returns the email, removes the key and strips only the signin param", () => {
    window.sessionStorage.setItem(SIGNIN_EMAIL_KEY, EMAIL);
    window.history.replaceState(null, "", "/watchlist?signin=success&x=1#top");
    expect(consumeSigninFlash()).toEqual({ email: EMAIL });
    expect(window.sessionStorage.getItem(SIGNIN_EMAIL_KEY)).toBeNull();
    expect(window.location.pathname + window.location.search + window.location.hash).toBe("/watchlist?x=1#top");
  });

  it("returns null without the flag, and still removes a stored email", () => {
    window.sessionStorage.setItem(SIGNIN_EMAIL_KEY, EMAIL);
    window.history.replaceState(null, "", "/watchlist");
    expect(consumeSigninFlash()).toBeNull();
    expect(window.sessionStorage.getItem(SIGNIN_EMAIL_KEY)).toBeNull();
  });

  it("returns a null email when the flag is present but storage is empty", () => {
    window.history.replaceState(null, "", "/watchlist?signin=success");
    expect(consumeSigninFlash()).toEqual({ email: null });
    expect(window.location.search).toBe("");
  });
});

describe("AuthCallbackPage sign-in redirect", () => {
  it("stores the email in sessionStorage and redirects without it in the URL", async () => {
    stubFetch({ "POST /api/auth/redeem": () => json({ email: EMAIL }) });
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, hash: "#token=abc", pathname: "/auth/callback", search: "", assign });
    render(<AuthCallbackPage />);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/watchlist?signin=success"));
    expect(window.sessionStorage.getItem(SIGNIN_EMAIL_KEY)).toBe(EMAIL);
    expect(String(assign.mock.calls[0]?.[0])).not.toContain("pilot");
  });
});

describe("WatchlistPage sign-in message", () => {
  it("announces the message inside role=status, cleans up, and dismisses", async () => {
    window.sessionStorage.setItem(SIGNIN_EMAIL_KEY, EMAIL);
    window.history.replaceState(null, "", "/watchlist?signin=success");
    const fetchMock = stubWatchlistApi();
    render(
      <StrictMode>
        <WatchlistPage />
      </StrictMode>,
    );
    const live = document.querySelector<HTMLElement>(".signin-flash");
    expect(live?.getAttribute("role")).toBe("status");
    await waitFor(() => expect(live?.textContent).toContain(MESSAGE));
    expect(window.location.search).toBe("");
    expect(window.location.href).not.toContain("pilot");
    expect(window.sessionStorage.getItem(SIGNIN_EMAIL_KEY)).toBeNull();

    await screen.findByRole("button", { name: "Remove New York JFK from watchlist" });
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/watchlist")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss sign-in message" }));
    expect(live?.textContent).toBe("");
    expect(live?.isConnected).toBe(true);
  });

  it("shows no message without the flag", async () => {
    window.sessionStorage.setItem(SIGNIN_EMAIL_KEY, EMAIL);
    stubWatchlistApi();
    render(<WatchlistPage />);
    await screen.findByRole("button", { name: "Remove New York JFK from watchlist" });
    expect(document.querySelector(".signin-flash")?.textContent).toBe("");
    expect(screen.queryByText(/Successfully signed in/)).toBeNull();
  });

  it("shows the message without an email when storage had none", async () => {
    window.history.replaceState(null, "", "/watchlist?signin=success");
    stubWatchlistApi();
    render(<WatchlistPage />);
    expect(await screen.findByText("Successfully signed in.")).toBeTruthy();
  });
});
