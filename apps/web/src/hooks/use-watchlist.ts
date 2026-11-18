import { useCallback, useEffect, useState } from "react";
import { addToWatchlist, deleteAccount, removeFromWatchlist } from "../api/watchlist";
import { loadWatchlist } from "./shared-watchlist";
import { errorText } from "../lib/url-params";

export interface UseWatchlistResult {
  /** Last list the API returned. Changes only on a successful response. */
  watchlist: string[];
  loading: boolean;
  /** True when GET /api/watchlist returned 401. */
  unauthorized: boolean;
  /** Text for the role="alert" region, or null. */
  error: string | null;
  busy: boolean;
  add: (airportId: string) => Promise<void>;
  remove: (airportId: string) => Promise<void>;
  /** Resolves true when the account was deleted. */
  removeAccount: () => Promise<boolean>;
}

function isUnauthorized(err: unknown): boolean {
  return typeof err === "object" && err !== null && "status" in err && (err as { status: unknown }).status === 401;
}

export function useWatchlist(): UseWatchlistResult {
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    loadWatchlist()
      .then((list) => {
        if (!active) return;
        setWatchlist(list);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (isUnauthorized(err)) setUnauthorized(true);
        else setError(errorText(err, "Could not load your watchlist. Try again."));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const mutate = useCallback(async (op: () => Promise<string[]>, fallback: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      setWatchlist(await op());
    } catch (err) {
      if (isUnauthorized(err)) setUnauthorized(true);
      else setError(errorText(err, fallback));
    } finally {
      setBusy(false);
    }
  }, []);

  const add = useCallback(
    (airportId: string) => mutate(() => addToWatchlist(airportId), "Could not add that airport. Try again."),
    [mutate],
  );
  const remove = useCallback(
    (airportId: string) => mutate(() => removeFromWatchlist(airportId), "Could not remove that airport. Try again."),
    [mutate],
  );

  const removeAccount = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      return true;
    } catch (err) {
      setError(errorText(err, "Could not delete your account. Try again."));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return { watchlist, loading, unauthorized, error, busy, add, remove, removeAccount };
}
