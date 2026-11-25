import { useSyncExternalStore } from "react";
import { type DisplayMode, resolveDisplayMode } from "../lib/time-text";

/** localStorage key for the time Display_Setting (Requirement 7.3). */
export const DISPLAY_MODE_KEY = "aerobrief.timeDisplay";

const listeners = new Set<() => void>();

function readStored(): string | null {
  try {
    return window.localStorage.getItem(DISPLAY_MODE_KEY);
  } catch {
    return null; // storage can throw (blocked, private mode)
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent): void => {
    if (event.key === DISPLAY_MODE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Stored display mode, "relative" when nothing valid is stored (Requirements 7.3, 7.4). */
export function useDisplayMode(): DisplayMode {
  return useSyncExternalStore(
    subscribe,
    () => resolveDisplayMode(readStored()),
    () => "relative",
  );
}

/** Saves the mode and updates every mounted TimeText. Storage failures leave the choice unsaved. */
export function setDisplayMode(mode: DisplayMode): void {
  try {
    window.localStorage.setItem(DISPLAY_MODE_KEY, mode);
  } catch {
    // Storage is blocked. The choice is not saved.
  }
  for (const listener of listeners) listener();
}
