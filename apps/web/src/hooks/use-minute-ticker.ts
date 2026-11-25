import { useSyncExternalStore } from "react";

/** Relative times refresh at least once a minute (Requirement 7.5). */
export const TICK_MS = 30 * 1000;

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let current = Date.now();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === undefined) {
    current = Date.now();
    timer = setInterval(() => {
      current = Date.now();
      for (const l of listeners) l();
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

function getSnapshot(): number {
  // With no subscribers the cached value can be old. Refresh it, but only when it is
  // at least a second stale so repeated reads in one render return the same number.
  if (timer === undefined) {
    const now = Date.now();
    if (now - current >= 1000) current = now;
  }
  return current;
}

/** Current time in ms, updated by one interval shared by every component that uses it. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
