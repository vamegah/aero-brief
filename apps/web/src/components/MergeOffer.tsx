import { useState } from "react";
import { WATCHLIST_CAP } from "@aerobrief/core/watchlist";
import { ApiResponseError } from "../api/auth";
import { addToWatchlist } from "../api/watchlist";
import { mergeIntoAccount, readLocalWatchlist, writeLocalWatchlist } from "../lib/local-watchlist";
import { errorText } from "../lib/url-params";
import { Banner } from "./Banner";
import { Button } from "./Button";

/** sessionStorage flag: the visitor said no, so do not ask again until the tab session ends. */
export const MERGE_DECLINED_KEY = "aerobrief.mergeOfferDeclined";

function declinedThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(MERGE_DECLINED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDecline(): void {
  try {
    window.sessionStorage.setItem(MERGE_DECLINED_KEY, "1");
  } catch {
    // Storage is blocked. The offer may show again on the next visit; nothing else is lost.
  }
}

export interface MergeOfferProps {
  /** The signed-in account's current watchlist. */
  account: readonly string[];
  /** Called with the list the API returned after airports were added. */
  onMerged: (list: string[]) => void;
}

type Phase = "offer" | "working" | "done" | "dismissed";

/**
 * After sign-in, offers to add the airports saved in this browser to the account (Requirement 4.3).
 * Accepting adds the missing airports one at a time through POST /api/watchlist, then clears the
 * browser list. Declining leaves the browser list untouched and is remembered for the session.
 */
export function MergeOffer({ account, onMerged }: MergeOfferProps) {
  const [local] = useState(() => readLocalWatchlist());
  const [phase, setPhase] = useState<Phase>(() =>
    local.length > 0 && !declinedThisSession() ? "offer" : "dismissed",
  );
  const [result, setResult] = useState<{ added: number; notAdded: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (phase === "dismissed") return null;

  const plan = mergeIntoAccount(local, account, WATCHLIST_CAP);
  const toAdd = plan.list.filter((id) => !account.includes(id));
  const alreadyThere = local.filter((id) => account.includes(id)).length;
  const missing = local.length - alreadyThere;
  const cannotAdd = Math.max(0, missing - toAdd.length);
  // Everything saved is already in the account: nothing to offer.
  if (phase === "offer" && missing === 0) return null;

  const accept = async (): Promise<void> => {
    setPhase("working");
    setError(null);
    let latest: string[] | null = null;
    let added = 0;
    try {
      for (const id of toAdd) {
        try {
          latest = await addToWatchlist(id);
          added += 1;
        } catch (err) {
          if (err instanceof ApiResponseError && err.status === 409 && err.code === "watchlist_full") {
            // The account filled up (for example from another tab). The rest cannot be added.
            break;
          }
          throw err;
        }
      }
    } catch (err) {
      // Keep the browser list so nothing is lost. Airports already added stay in the account.
      if (latest !== null) onMerged(latest);
      setError(errorText(err, "Could not add your saved airports. Try again."));
      setPhase("offer");
      return;
    }
    if (latest !== null) onMerged(latest);
    writeLocalWatchlist([]);
    setResult({ added, notAdded: cannotAdd + (toAdd.length - added) });
    setPhase("done");
  };

  const decline = (): void => {
    rememberDecline();
    setPhase("dismissed");
  };

  if (phase === "done" && result !== null) {
    return (
      <Banner variant="success">
        {result.added === 1 ? "Added 1 airport to your account." : `Added ${result.added} airports to your account.`}
        {result.notAdded > 0
          ? ` ${result.notAdded === 1 ? "1 airport" : `${result.notAdded} airports`} could not be added because an account holds ${WATCHLIST_CAP} airports at most.`
          : ""}
      </Banner>
    );
  }

  return (
    <Banner variant="stale">
      <p>
        {`You saved ${local.length === 1 ? "1 airport" : `${local.length} airports`} in this browser. Add ${local.length === 1 ? "it" : "them"} to your account?`}
        {cannotAdd > 0
          ? ` Your account has room for ${toAdd.length}, so ${cannotAdd === 1 ? "1 airport" : `${cannotAdd} airports`} could not be added.`
          : ""}
      </p>
      {/* No role="alert": the page wraps this offer in a polite status region, which announces it. */}
      {error !== null ? <p>{error}</p> : null}
      <div className="chip-row">
        <Button variant="primary" disabled={phase === "working"} onClick={() => void accept()}>
          {phase === "working" ? "Adding…" : "Add to my account"}
        </Button>
        <Button variant="ghost" disabled={phase === "working"} onClick={decline}>
          Not now
        </Button>
      </div>
    </Banner>
  );
}
