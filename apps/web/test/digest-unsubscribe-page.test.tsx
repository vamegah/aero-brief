import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { ALL_FLAGS_OFF } from "../src/features/features-schema";
import { FeaturesContext } from "../src/features/use-features";
const ON = { ...ALL_FLAGS_OFF, digests: true };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let fetchMock: ReturnType<typeof vi.fn>;
const digestCalls = () =>
  fetchMock.mock.calls.filter((c) => String(c[0]).startsWith("/api/digest/unsubscribe"));
function open(search: string, flags = ON) {
  window.history.replaceState(null, "", `/digest/unsubscribe${search}`);
  return render(
    <FeaturesContext.Provider value={flags}>
      <App />
    </FeaturesContext.Provider>,
  );
}
function mockDigest(respond: () => Response) {
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).startsWith("/api/digest/unsubscribe")) return respond();
    return json({ state: "no_data", message: "none" });
  });
}
beforeEach(() => {
  fetchMock = vi.fn(async () => json({ state: "no_data", message: "none" }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
describe("DigestUnsubscribePage", () => {
  it("renders Not found while digests is off", () => {
    open("?u=U1&s=SIG", ALL_FLAGS_OFF);
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirm unsubscribe" })).toBeNull();
    expect(digestCalls()).toHaveLength(0);
  });
  it.each(["", "?u=U1", "?s=SIG", "?u=&s=SIG"])("shows the invalid-link text without a request for %j", (search) => {
    open(search);
    expect(screen.getByRole("alert").textContent).toContain("This link is invalid or has expired.");
    expect(screen.queryByRole("button", { name: "Confirm unsubscribe" })).toBeNull();
    expect(digestCalls()).toHaveLength(0);
  });
  it("does not post until the button is pressed, then posts JSON and states the digest is off", async () => {
    mockDigest(() => json({ enabled: false }));
    open("?u=U1&s=SIG");
    expect(digestCalls()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirm unsubscribe" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Your daily digest is turned off."));
    expect(screen.getByRole("status").textContent).toContain("You will not get any more daily digest emails.");
    expect(screen.getByRole("link", { name: "Go to your watchlist" }).getAttribute("href")).toBe("/watchlist");
    expect(digestCalls()).toHaveLength(1);
    const [url, init] = digestCalls()[0] as [string, RequestInit];
    expect(url).toBe("/api/digest/unsubscribe");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ userId: "U1", sig: "SIG" });
  });
  it.each([
    ["403", () => json({ error: { code: "invalid_signature", message: "bad" } }, 403)],
    ["400", () => json({ error: { code: "validation_failed", message: "bad" } }, 400)],
  ])("shows the invalid-link text on %s", async (_n, respond) => {
    mockDigest(respond);
    open("?u=U1&s=SIG");
    fireEvent.click(screen.getByRole("button", { name: "Confirm unsubscribe" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("This link is invalid or has expired."));
    expect(screen.queryByText(/turned off/)).toBeNull();
  });
  it("shows the generic text on a network error", async () => {
    mockDigest(() => {
      throw new TypeError("Failed to fetch");
    });
    open("?u=U1&s=SIG");
    fireEvent.click(screen.getByRole("button", { name: "Confirm unsubscribe" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Something went wrong. Try the link again."));
  });
  it("confirm control is a native button, reachable by keyboard", () => {
    open("?u=U1&s=SIG");
    const button = screen.getByRole("button", { name: "Confirm unsubscribe" }) as HTMLButtonElement;
    expect(button.tagName).toBe("BUTTON");
    expect(button.disabled).toBe(false);
    expect(button.tabIndex).toBeGreaterThanOrEqual(0);
    button.focus();
    expect(document.activeElement).toBe(button);
  });
});
