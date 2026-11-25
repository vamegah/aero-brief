import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  decodeDashboardQuery,
  encodeDashboardQuery,
  type DashboardQueryState,
} from "../lib/dashboard-query";

const OWN_KEYS = ["show", "q", "airport", "type", "state"];

/**
 * Filter and search state for the Status page, kept in the URL query string (Requirement 11.7).
 * Read once from `window.location.search` on load. Every change is written with
 * `history.replaceState`, so the `#section` hash and any other query params stay as they are and no
 * history entries are added.
 */
export function useDashboardQuery(): [DashboardQueryState, Dispatch<SetStateAction<DashboardQueryState>>] {
  const [state, setState] = useState<DashboardQueryState>(() => decodeDashboardQuery(window.location.search));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    for (const key of OWN_KEYS) params.delete(key);
    const own = encodeDashboardQuery(state);
    const rest = params.toString();
    const search = [rest, own].filter((part) => part !== "").join("&");
    const next = `${window.location.pathname}${search === "" ? "" : `?${search}`}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) window.history.replaceState(window.history.state, "", next);
  }, [state]);

  return [state, setState];
}
