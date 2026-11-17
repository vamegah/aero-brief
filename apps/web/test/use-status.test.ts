import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NationalStatusResponse } from "../src/api/client";
import { fetchNationalStatus, isNationalStatusResponse } from "../src/api/client";
import { useStatus } from "../src/hooks/use-status";

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const NOW = new Date("2026-01-02T12:00:00.000Z");

function okBody(events: { occurredAt: string }[] = []): NationalStatusResponse {
  return {
    state: "ok",
    capturedAt: NOW.toISOString(),
    stale: false,
    airports: [{ airportId: "JFK", name: "New York JFK", groundStop: null }],
    nationwide: { active: false, count: 0, artccs: [], explanation: null },
    events: events.map((e) => ({
      type: "GROUND_STOP_STARTED",
      airportId: "JFK",
      occurredAt: e.occurredAt,
      explanation: "x",
    })),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn<FetchFn>>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  fetchMock = vi.fn<FetchFn>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchNationalStatus", () => {
  it("requests /api/status/national with an abort signal", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(okBody()));
    await fetchNationalStatus();
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("/api/status/national");
    expect(call?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects on a non-2xx status and on a malformed body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(fetchNationalStatus()).rejects.toThrow(/HTTP 500/);
    fetchMock.mockResolvedValueOnce(jsonResponse({ state: "ok" }));
    await expect(fetchNationalStatus()).rejects.toThrow(/unexpected shape/);
  });

  it("validates the no_data shape", () => {
    expect(isNationalStatusResponse({ state: "no_data", message: "m" })).toBe(true);
    expect(isNationalStatusResponse({ state: "no_data" })).toBe(false);
  });
});

describe("useStatus", () => {
  it("loads on mount and filters/sorts events", async () => {
    const recent = new Date(NOW.getTime() - 1000).toISOString();
    const older = new Date(NOW.getTime() - 2000).toISOString();
    const stale = new Date(NOW.getTime() - 25 * 3600 * 1000).toISOString();
    fetchMock.mockResolvedValue(jsonResponse(okBody([{ occurredAt: older }, { occurredAt: stale }, { occurredAt: recent }])));
    const { result } = renderHook(() => useStatus());
    expect(result.current.loading).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.refreshFailed).toBe(false);
    expect(result.current.events.map((e) => e.occurredAt)).toEqual([recent, older]);
  });

  it("refreshes every 60 s and keeps last data when a refresh fails", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(okBody()));
    const { result } = renderHook(() => useStatus());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const first = result.current.status;
    expect(first?.state).toBe("ok");

    fetchMock.mockRejectedValueOnce(new Error("network"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.refreshFailed).toBe(true);
    expect(result.current.status).toBe(first);

    fetchMock.mockResolvedValueOnce(jsonResponse(okBody()));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(result.current.refreshFailed).toBe(false);
  });

  it("sets refreshFailed with no data when the first load fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network"));
    const { result } = renderHook(() => useStatus());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBeNull();
    expect(result.current.refreshFailed).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it("aborts the request and stops polling on unmount", async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    const { unmount } = renderHook(() => useStatus());
    const signal = fetchMock.mock.calls[0]?.[1]?.signal;
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
