import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function getSnapshot(): string {
  return window.location.hash;
}

function getServerSnapshot(): string {
  return "";
}

/** Current `window.location.hash` (for example "#digest", or ""). Updates on `hashchange`. */
export function useLocationHash(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
