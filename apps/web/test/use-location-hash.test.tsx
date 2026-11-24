import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLocationHash } from "../src/hooks/use-location-hash";

afterEach(() => {
  window.location.hash = "";
  vi.restoreAllMocks();
});

describe("useLocationHash", () => {
  it("returns the current hash", () => {
    window.location.hash = "#digest";
    const { result } = renderHook(() => useLocationHash());
    expect(result.current).toBe("#digest");
  });

  it("returns an empty string when there is no hash", () => {
    const { result } = renderHook(() => useLocationHash());
    expect(result.current).toBe("");
  });

  it("updates on hashchange", () => {
    const { result } = renderHook(() => useLocationHash());
    act(() => {
      window.location.hash = "#webhooks";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(result.current).toBe("#webhooks");
  });

  it("removes its hashchange listener on unmount", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useLocationHash());
    const added = add.mock.calls.filter(([type]) => type === "hashchange");
    expect(added).toHaveLength(1);
    unmount();
    const removed = remove.mock.calls.filter(([type]) => type === "hashchange");
    expect(removed).toHaveLength(1);
    expect(removed[0]?.[1]).toBe(added[0]?.[1]);
  });
});
