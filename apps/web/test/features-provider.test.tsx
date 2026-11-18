import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeaturesProvider } from "../src/features/FeaturesProvider";
import { useFeatures } from "../src/features/use-features";

function Probe() {
  const f = useFeatures();
  return <p data-testid="flags">{JSON.stringify(f)}</p>;
}

const OFF = { darkMode: false, highContrast: false, digests: false, webhooks: false };
const ON = { darkMode: true, highContrast: true, digests: true, webhooks: true };
const flags = () => JSON.parse(screen.getByTestId("flags").textContent ?? "{}") as unknown;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("FeaturesProvider", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("returns all flags off without a provider", () => {
    render(<Probe />);
    expect(flags()).toEqual(OFF);
  });

  it("renders children at once with all flags off, then applies the response", async () => {
    const fetchMock = vi.fn(async (_url: string) => json(ON));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <FeaturesProvider>
        <Probe />
      </FeaturesProvider>,
    );
    expect(flags()).toEqual(OFF);
    await waitFor(() => expect(flags()).toEqual(ON));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/features");
  });

  it("requests /api/features once across re-renders", async () => {
    const fetchMock = vi.fn(async () => json(ON));
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(
      <FeaturesProvider>
        <Probe />
      </FeaturesProvider>,
    );
    await waitFor(() => expect(flags()).toEqual(ON));
    rerender(
      <FeaturesProvider>
        <Probe />
      </FeaturesProvider>,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["404 status", () => Promise.resolve(json({ error: "not found" }, 404))],
    ["500 status", () => Promise.resolve(json(ON, 500))],
    ["network error", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["invalid JSON", () => Promise.resolve(new Response("not json", { status: 200 }))],
    ["non-boolean flag", () => Promise.resolve(json({ ...ON, digests: "true" }))],
    ["missing flag", () => Promise.resolve(json({ darkMode: true, highContrast: true, digests: true }))],
    ["array body", () => Promise.resolve(json([true, true, true, true]))],
    ["null body", () => Promise.resolve(json(null))],
  ])("keeps all flags off on %s", async (_name, respond) => {
    const fetchMock = vi.fn(respond);
    vi.stubGlobal("fetch", fetchMock);
    render(
      <FeaturesProvider>
        <Probe />
      </FeaturesProvider>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(flags()).toEqual(OFF);
  });

  it("aborts after 3 seconds and keeps all flags off", async () => {
    vi.useFakeTimers();
    let aborted = false;
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <FeaturesProvider>
        <Probe />
      </FeaturesProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2999);
    });
    expect(aborted).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(aborted).toBe(true);
    expect(flags()).toEqual(OFF);
  });

  it("ignores flags in the URL and local storage", async () => {
    window.history.replaceState(null, "", "/?darkMode=true&digests=true&FEATURE_DIGESTS=true");
    localStorage.setItem("darkMode", "true");
    localStorage.setItem("features", JSON.stringify(ON));
    localStorage.setItem("FEATURE_WEBHOOKS", "true");
    const fetchMock = vi.fn(async () => json({ error: "not found" }, 404));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <FeaturesProvider>
        <Probe />
      </FeaturesProvider>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(flags()).toEqual(OFF);
  });

  it("does not read a build-time variable for flags", () => {
    const env = import.meta.env as Record<string, unknown>;
    const names = Object.keys(env).filter((k) => /FEATURE|DARK|CONTRAST|DIGEST|WEBHOOK/i.test(k));
    expect(names).toEqual([]);
  });
});
