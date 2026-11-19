// Flags-off guard for the digest unsubscribe page. With every flag off (no provider, or a provider
// whose response has every flag false), /digest/unsubscribe renders the Not found page and makes
// no request to /api/digest*. Independent of how the page itself is built.
// Validates Requirements 1.5, 3.1, 3.2.
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { FeaturesProvider } from "../src/features/FeaturesProvider";

const ALL_OFF = { darkMode: false, highContrast: false, digests: false, webhooks: false };
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

function urlOf(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof URL) return arg.href;
  return (arg as Request).url;
}

describe("digest unsubscribe page with every flag off", () => {
  let originalPath = "/";
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalPath = window.location.pathname + window.location.search;
    window.history.pushState(null, "", "/digest/unsubscribe?token=abc");
    fetchMock = vi.fn(async (input: unknown) => (urlOf(input).includes("/api/features") ? json(ALL_OFF) : json({})));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", originalPath);
  });

  const digestCalls = () => fetchMock.mock.calls.map((c) => urlOf(c[0])).filter((u) => u.includes("/api/digest"));

  it("renders Not found and calls no digest endpoint without a FeaturesProvider", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeTruthy();
    await new Promise((r) => setTimeout(r, 20));
    expect(digestCalls()).toEqual([]);
  });

  it("renders Not found and calls no digest endpoint under a provider with every flag off", async () => {
    render(
      <FeaturesProvider>
        <App />
      </FeaturesProvider>,
    );
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeTruthy();
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => urlOf(c[0]).includes("/api/features"))).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeTruthy();
    expect(digestCalls()).toEqual([]);
  });
});
