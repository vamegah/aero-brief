import { useState } from "react";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { ErrorRegion } from "../components/ErrorRegion";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { WatchlistTable } from "../components/WatchlistTable";
import { useStatus } from "../hooks/use-status";
import { useWatchlist } from "../hooks/use-watchlist";

const MAX_WATCHLIST = 10;

export function WatchlistPage() {
  const { status } = useStatus();
  const { watchlist, loading, unauthorized, error, busy, add, remove, removeAccount } = useWatchlist();
  const [confirming, setConfirming] = useState(false);

  const airports = status !== null && status.state === "ok" ? status.airports : [];
  const nameOf = (id: string) => airports.find((a) => a.airportId === id)?.name ?? id;

  async function onConfirmDelete() {
    if (await removeAccount()) window.location.assign("/");
    else setConfirming(false);
  }

  if (unauthorized) {
    return (
      <>
        <PageHeader title="Your watchlist" />
        <ErrorRegion message="Sign in to see your watchlist." />
        <p>
          <a href="/sign-in">Go to sign in</a>
        </p>
      </>
    );
  }

  const counter = loading ? undefined : (
    <span role="status" className="metric-chip">
      <span className="metric-chip__value">
        {watchlist.length} of {MAX_WATCHLIST} airports watched
      </span>
    </span>
  );

  return (
    <>
      <PageHeader title="Your watchlist" action={counter} />
      <ErrorRegion message={error} />
      {loading ? (
        <LoadingState text="Loading your watchlist…" />
      ) : watchlist.length === 0 ? (
        <EmptyState text="You are not watching any airports yet." />
      ) : (
        <ul className="watched-list" aria-label="Watched airports">
          {watchlist.map((id) => (
            <li key={id} className="watched-list__item">
              <span className="watched-list__name">
                {id}: {nameOf(id)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {airports.length > 0 ? (
        <WatchlistTable
          airports={airports}
          watchlist={watchlist}
          disabled={busy || loading}
          onAdd={(id) => void add(id)}
          onRemove={(id) => void remove(id)}
        />
      ) : null}
      <section className="account-section" aria-labelledby="account-heading">
        <h3 id="account-heading">Account</h3>
        <Button variant="danger" onClick={() => setConfirming(true)}>
          Delete account
        </Button>
        <ConfirmDialog
          open={confirming}
          label="Confirm account deletion"
          title="Delete your account?"
          confirmLabel="Confirm delete account"
          cancelLabel="Cancel"
          onConfirm={() => void onConfirmDelete()}
          onCancel={() => setConfirming(false)}
        >
          Delete your account and all your watchlist data? This cannot be undone.
        </ConfirmDialog>
      </section>
    </>
  );
}
