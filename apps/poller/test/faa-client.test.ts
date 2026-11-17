import { describe, expect, it, vi } from "vitest";
import { FAA_API_URL, FAA_TIMEOUT_MS, fetchFaa } from "../src/faa-client";

function mockFetch(impl: () => Promise<Response>) {
  return vi.fn((_input: string, _init: { signal: AbortSignal }) => impl());
}

describe("fetchFaa", () => {
  it("returns the parsed response on success and calls the FAA URL exactly once", async () => {
    const body = JSON.stringify([{ airportId: "JFK", airportLongName: "John F Kennedy", groundStop: null }]);
    const fn = mockFetch(async () => new Response(body, { status: 200 }));
    const result = await fetchFaa(fn);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response).toHaveLength(1);
      expect(typeof result.fetchedAt).toBe("string");
    }
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0]?.[0]).toBe(FAA_API_URL);
    expect(fn.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
  });

  it("uses the exact FAA_API URL", () => {
    expect(FAA_API_URL).toBe("https://nasstatus.faa.gov/api/airport-events");
  });

  it("classifies a TimeoutError as timeout", async () => {
    const fn = mockFetch(async () => {
      throw new DOMException("signal timed out", "TimeoutError");
    });
    const result = await fetchFaa(fn);
    expect(result).toMatchObject({ ok: false, kind: "timeout" });
  });

  it("aborts a hanging request after FAA_TIMEOUT_MS and reports timeout", async () => {
    // AbortSignal.timeout is driven by a runtime-internal timer that fake timers
    // do not advance, so substitute a controllable signal and abort it ourselves.
    const controller = new AbortController();
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    try {
      const fn = vi.fn(
        (_input: string, init: { signal: AbortSignal }) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal.addEventListener("abort", () => reject(init.signal.reason));
          }),
      );
      // fetchFaa calls fn synchronously, so the abort listener is registered before we abort.
      const pending = fetchFaa(fn);
      expect(timeoutSpy).toHaveBeenCalledTimes(1);
      expect(timeoutSpy).toHaveBeenCalledWith(FAA_TIMEOUT_MS);
      expect(fn.mock.calls[0]?.[1].signal).toBe(controller.signal);

      controller.abort(new DOMException("signal timed out", "TimeoutError"));
      await expect(pending).resolves.toMatchObject({ ok: false, kind: "timeout" });
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it("classifies HTTP 500 as http_status with the code in detail", async () => {
    const fn = mockFetch(async () => new Response("boom", { status: 500 }));
    const result = await fetchFaa(fn);
    expect(result).toMatchObject({ ok: false, kind: "http_status" });
    if (!result.ok) expect(result.detail).toContain("500");
  });

  it("classifies a non-JSON body as unparseable and truncates detail", async () => {
    const fn = mockFetch(async () => new Response("<html>" + "x".repeat(5000), { status: 200 }));
    const result = await fetchFaa(fn);
    expect(result).toMatchObject({ ok: false, kind: "unparseable" });
    if (!result.ok) expect(result.detail.length).toBeLessThanOrEqual(201);
  });

  it("classifies JSON of the wrong shape as validation", async () => {
    const fn = mockFetch(async () => new Response(JSON.stringify({ not: "an array" }), { status: 200 }));
    const result = await fetchFaa(fn);
    expect(result).toMatchObject({ ok: false, kind: "validation" });
  });

  it("does not throw on a non-timeout network error", async () => {
    const fn = mockFetch(async () => {
      throw new TypeError("Network connection lost");
    });
    const result = await fetchFaa(fn);
    expect(result).toMatchObject({ ok: false, kind: "network", detail: "TypeError: Network connection lost" });
  });
});
