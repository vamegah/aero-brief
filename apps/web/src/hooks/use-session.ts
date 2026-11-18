import { useEffect, useState } from "react";
import { loadWatchlist } from "./shared-watchlist";

/** "loading" until GET /api/watchlist settles. A 401 means signed out; success means signed in. */
export type SessionState = "loading" | "signed-in" | "signed-out";

/** There is no session endpoint, so the watchlist GET doubles as the signed-in probe. */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>("loading");

  useEffect(() => {
    let active = true;
    loadWatchlist()
      .then(() => {
        if (active) setState("signed-in");
      })
      .catch(() => {
        // A 401 means signed out. Any other failure also falls back to offering sign-in.
        if (active) setState("signed-out");
      });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
