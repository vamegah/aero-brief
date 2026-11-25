import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/App";
import { AuthCallbackPage } from "../../src/pages/AuthCallbackPage";
import { NotFoundPage } from "../../src/pages/NotFoundPage";
import { SignInPage } from "../../src/pages/SignInPage";
import { UnsubscribePage } from "../../src/pages/UnsubscribePage";
import { apiError, json, NORMAL, stubFetch } from "../a11y/fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
});

describe("NotFoundPage", () => {
  it("shows the message and a link to airport status", () => {
    render(<NotFoundPage />);
    expect(screen.getByRole("heading", { level: 2, name: "Page not found" })).toBeTruthy();
    expect(screen.getByText("There is no page at this address.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to airport status" }).getAttribute("href")).toBe("/");
  });
});

describe("App routing", () => {
  it("renders the Not found page for an unknown path, with a single h1", () => {
    window.history.pushState({}, "", "/no-such-page");
    render(<App />);
    expect(screen.getByRole("heading", { level: 2, name: "Page not found" })).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("renders the Status page at /", async () => {
    stubFetch({ "GET /api/status/national": () => json(NORMAL) });
    window.history.pushState({}, "", "/");
    render(<App />);
    expect(screen.queryByText("Page not found")).toBeNull();
    expect(await screen.findByText("New York JFK")).toBeTruthy();
  });
});

describe("SignInPage states", () => {
  it("disables the button and shows Sending… while sending", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    render(<SignInPage />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "pilot@example.com" } });
    fireEvent.submit(screen.getByRole("button", { name: "Email me a sign-in link" }).closest("form") as HTMLFormElement);
    const button = (await screen.findByRole("button", { name: "Sending…" })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("replaces the form with Check your inbox on success", async () => {
    stubFetch({ "POST /api/auth/magic-link": () => json({ ok: true }, 202) });
    const { container } = render(<SignInPage />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "pilot@example.com" } });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    expect(await screen.findByText("Check your inbox")).toBeTruthy();
    expect(container.querySelector("form")).toBeNull();
  });

  it("shows the subtitle", () => {
    render(<SignInPage />);
    expect(screen.getByText("We email you a one-time link. No password.")).toBeTruthy();
  });
});

describe("AuthCallbackPage states", () => {
  it("shows the loading text while redeeming", () => {
    window.history.replaceState(null, "", "/auth/callback#token=abc");
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    render(<AuthCallbackPage />);
    expect(screen.getByRole("heading", { level: 2, name: "Signing in" }).id).toBe("callback-heading");
    expect(screen.getByText("Signing you in…")).toBeTruthy();
  });

  it("shows the error in role=alert and a new-link link when redeeming fails", async () => {
    window.history.replaceState(null, "", "/auth/callback#token=abc");
    stubFetch({ "POST /api/auth/redeem": () => apiError(401, "invalid_token", "This link has expired.") });
    const { container } = render(<AuthCallbackPage />);
    await waitFor(() => {
      expect((container.querySelector("[role='alert']") as HTMLElement).textContent).toBe("This link has expired.");
    });
    expect(screen.getByRole("link", { name: "Request a new sign-in link" }).getAttribute("href")).toBe("/sign-in");
    expect(screen.queryByText("Signing you in…")).toBeNull();
  });
});

describe("UnsubscribePage states", () => {
  const url = "/unsubscribe?u=user-1&a=JFK&sig=abc";

  it("shows the confirmation naming the airport and a watchlist link", async () => {
    window.history.replaceState(null, "", url);
    stubFetch({ "POST /api/unsubscribe": () => json({ airportId: "JFK", airportName: "New York JFK" }) });
    render(<UnsubscribePage />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm unsubscribe" }));
    expect(await screen.findByText(/You will no longer get alerts for New York JFK\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to your watchlist" }).getAttribute("href")).toBe("/watchlist");
  });

  it("shows Unsubscribing… while the request is pending", async () => {
    window.history.replaceState(null, "", url);
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    render(<UnsubscribePage />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm unsubscribe" }));
    expect(await screen.findByText("Unsubscribing…")).toBeTruthy();
  });

  it("shows the API error in role=alert with a watchlist link", async () => {
    window.history.replaceState(null, "", url);
    stubFetch({ "POST /api/unsubscribe": () => apiError(403, "invalid_signature", "This unsubscribe link is not valid.") });
    const { container } = render(<UnsubscribePage />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm unsubscribe" }));
    await waitFor(() => {
      expect((container.querySelector("[role='alert']") as HTMLElement).textContent).toBe(
        "This unsubscribe link is not valid.",
      );
    });
    expect(screen.getByRole("link", { name: "Go to your watchlist" })).toBeTruthy();
  });

  it("shows an error state when parameters are missing", () => {
    window.history.replaceState(null, "", "/unsubscribe");
    const { container } = render(<UnsubscribePage />);
    expect((container.querySelector("[role='alert']") as HTMLElement).textContent).toBe(
      "This unsubscribe link is incomplete or not valid.",
    );
    expect(screen.queryByRole("button", { name: "Confirm unsubscribe" })).toBeNull();
  });
});
