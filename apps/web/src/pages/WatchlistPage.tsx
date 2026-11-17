import { useState } from "react";
import { ErrorRegion } from "../components/ErrorRegion";
import { SignOutButton } from "../components/SignOutButton";
import { WatchlistTable } from "../components/WatchlistTable";
import { useStatus } from "../hooks/use-status";
import { useWatchlist } from "../hooks/use-watchlist";

export function WatchlistPage() {
  const { status } = useStatus();
  const { watchlist, loading, unauthorized, error, busy, add, remove, removeAccount } = useWatchlist();
  const [confirming, setConfirming] = useState(false);

  const airports = status !== null && status.state === "ok" ? status.airports : [];

  async function onConfirmDelete() {
    if (await removeAccount()) window.location.assign("/");
    else setConfirming(false);
  }

  if (unauthorized) {
    return (
      <section aria-labelledby="watchlist-heading">
        <h2 id="watchlist-heading">Your watchlist</h2>
        <ErrorRegion message="Sign in to see your watchlist." />
        <p>
          <a href="/sign-in">Go to sign in</a>
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="watchlist-heading">
      <h2 id="watchlist-heading">Your watchlist</h2>
      <ErrorRegion message={error} />
      <div role="status">{loading ? <p>Loading your watchlist…</p> : <p>Watching {watchlist.length} airports.</p>}</div>
      {airports.length > 0 ? (
        <WatchlistTable
          airports={airports}
          watchlist={watchlist}
          disabled={busy || loading}
          onAdd={(id) => void add(id)}
          onRemove={(id) => void remove(id)}
        />
      ) : (
        <ul>
          {watchlist.map((id) => (
            <li key={id}>
              {id}: Watching{" "}
              <button type="button" disabled={busy} aria-label={`Remove ${id} from watchlist`} onClick={() => void remove(id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3>Account</h3>
      <SignOutButton />
      {confirming ? (
        <div role="group" aria-label="Confirm account deletion">
          <p>Delete your account and all your watchlist data? This cannot be undone.</p>
          <button type="button" disabled={busy} onClick={() => void onConfirmDelete()}>
            Confirm delete account
          </button>{" "}
          <button type="button" disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)}>
          Delete account
        </button>
      )}
    </section>
  );
}
