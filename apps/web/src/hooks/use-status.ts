import { useEffect, useState } from "react";
import { fetchNationalStatus, type EventSummary, type NationalStatusResponse } from "../api/client";
import { selectDisplayEvents } from "../lib/display-window";

export const REFRESH_INTERVAL_MS = 60_000;

export interface UseStatusResult {
  /** Last successfully loaded response, or null before the first success. */
  status: NationalStatusResponse | null;
  /** Events from `status` within the last 24 h, newest first (empty unless state is "ok"). */
  events: EventSummary[];
  /** True until the first request settles. */
  loading: boolean;
  /** True when the most recent request failed. Cleared by the next success. */
  refreshFailed: boolean;
}

interface State {
  status: NationalStatusResponse | null;
  events: EventSummary[];
  loading: boolean;
  refreshFailed: boolean;
}

const INITIAL: State = { status: null, events: [], loading: true, refreshFailed: false };

/** Loads the national status on mount and every 60 s. Failures keep the last data. */
export function useStatus(): UseStatusResult {
  const [state, setState] = useState<State>(INITIAL);

  useEffect(() => {
    const controller = new AbortController();

    const load = async (): Promise<void> => {
      try {
        const status = await fetchNationalStatus(controller.signal);
        if (controller.signal.aborted) return;
        const events = status.state === "ok" ? selectDisplayEvents(status.events, new Date()) : [];
        setState({ status, events, loading: false, refreshFailed: false });
      } catch {
        if (controller.signal.aborted) return;
        setState((prev) => ({ ...prev, loading: false, refreshFailed: true }));
      }
    };

    void load();
    const timer = setInterval(() => {
      void load();
    }, REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, []);

  return state;
}
