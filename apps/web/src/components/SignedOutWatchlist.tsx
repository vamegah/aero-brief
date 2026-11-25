import { useMemo, useState } from "react";
import { AIRPORTS, type MonitoredId } from "@aerobrief/core/airports";
import { WATCHLIST_CAP } from "@aerobrief/core/watchlist";
import type { EventSummary, NationalStatusResponse } from "../api/client";
import { matchesAirportSearch, rankAirportMatches } from "../lib/airport-search";
import { readLocalWatchlist, sortBySeverity, writeLocalWatchlist } from "../lib/local-watchlist";
import { buildWatchedViews } from "../lib/watchlist-view";
import { AirportStatusPill } from "./AirportStatusPill";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { FormLabel } from "./FormLabel";
import { PageHeader } from "./PageHeader";
import { TextInput } from "./TextInput";
import { TimeText } from "./TimeText";

export const QUICK_ADD_IDS: readonly MonitoredId[] = ["ATL", "DFW", "LAS"];

export interface SignedOutWatchlistProps {
  status: NationalStatusResponse | null;
  events: readonly EventSummary[];
}

/**
 * The Watchlist page for a visitor without an account (Requirement 4). The list lives in browser
 * storage, so adding and removing work without any API call. There is no error banner: being
 * signed out is a normal state here, and the only primary action is "Sign in".
 */
export function SignedOutWatchlist({ status, events }: SignedOutWatchlistProps) {
  const [ids, setIds] = useState<MonitoredId[]>(() => readLocalWatchlist());
  const [query, setQuery] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);

  const update = (next: MonitoredId[]): void => {
    setIds(next);
    setSaveFailed(!writeLocalWatchlist(next));
  };
  const add = (id: MonitoredId): void => {
    if (ids.includes(id) || ids.length >= WATCHLIST_CAP) return;
    update([...ids, id]);
  };
  const remove = (id: MonitoredId): void => update(ids.filter((x) => x !== id));

  const full = ids.length >= WATCHLIST_CAP;
  const ok = status !== null && status.state === "ok" ? status : null;
  const views = useMemo(() => {
    const all = buildWatchedViews(ids, status, events, new Date());
    const byId = new Map(all.map((v) => [v.airportId, v]));
    const order = sortBySeverity(
      all.map((v) => v.airportId),
      (id) => byId.get(id)?.kind ?? "normal",
    );
    return order.flatMap((id) => byId.get(id) ?? []);
  }, [ids, status, events]);

  const matches = rankAirportMatches(
    AIRPORTS.filter(
      (a) => !ids.includes(a.id) && matchesAirportSearch({ airportId: a.id, name: a.name, city: a.city }, query),
    ),
    query,
    (a) => ({ airportId: a.id, name: a.name, city: a.city }),
  );
  const searching = query.trim() !== "";

  return (
    <>
      <PageHeader
        title="Your watchlist"
        action={
          <span role="status" className="metric-chip">
            <span className="metric-chip__value">
              {ids.length} of {WATCHLIST_CAP} airports watched
            </span>
          </span>
        }
      />
      <section className="signed-out-intro" aria-label="About your watchlist">
        <div className="signed-out-intro__group">
          <p>
            Pick the airports you care about and see at a glance whether each one is running normally. Your list stays
            in this browser.
          </p>
          <a className="btn btn--primary" href="/sign-in">
            Sign in
          </a>
        </div>
        <p className="form__hint signed-out-intro__note">
          The daily digest and email alerts need an account. Everything else here works without one.
        </p>
      </section>

      {saveFailed ? (
        <p role="status" className="form__hint">
          This browser would not save your list, so it will be gone when you close the page.
        </p>
      ) : null}

      <section aria-label="Add airports" className="signed-out-section">
        <p id="quick-add-label" className="signed-out-quick-add__label">Quick add</p>
        <div role="group" aria-labelledby="quick-add-label" className="chip-row">
          {QUICK_ADD_IDS.map((id) => (
            <Button
              key={id}
              variant="secondary"
              className="chip"
              aria-label={`Add ${id} to watchlist`}
              disabled={ids.includes(id) || full}
              onClick={() => add(id)}
            >
              {id}
            </Button>
          ))}
        </div>
        <div className="airport-search watchlist-search">
          <FormLabel htmlFor="watchlist-search">Search airports</FormLabel>
          <TextInput
            id="watchlist-search"
            type="search"
            value={query}
            placeholder="Code or city, e.g. LAS or Las Vegas"
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
          />
        </div>
        {full ? (
          <p role="status" className="form__hint">
            Your list is full ({WATCHLIST_CAP} airports). Remove one to add another.
          </p>
        ) : null}
        {searching ? (
          matches.length === 0 ? (
            <p role="status">No airports match your search.</p>
          ) : (
            <ul className="watch-results" aria-label="Search results">
              {matches.map((a) => (
                <li key={a.id}>
                  <span>
                    {a.name} ({a.id})
                  </span>
                  <Button
                    variant="secondary"
                    aria-label={`Add ${a.name} to watchlist`}
                    disabled={full}
                    onClick={() => add(a.id)}
                  >
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </section>

      <section aria-label="Watched airports" className="signed-out-section">
        <h3>Your airports</h3>
        {views.length === 0 ? (
          <EmptyState text="You are not watching any airports yet. Use a quick add button or the search above." />
        ) : (
          <>
            <p className="form__hint">Sorted by severity: ground stops first, then recovering, then normal.</p>
            {ok !== null ? (
              <p className="form__hint">
                Status updated <TimeText iso={ok.capturedAt} />
              </p>
            ) : (
              <p className="form__hint">Status is not available right now. It will refresh automatically.</p>
            )}
            <ul className="watch-list">
              {views.map((v) => (
                <li key={v.airportId} className="watch-list__item">
                  <div className="watch-list__head">
                    <strong>
                      {v.name} ({v.airportId})
                    </strong>
                    <AirportStatusPill kind={v.kind} />
                    <Button
                      variant="ghost"
                      aria-label={`Remove ${v.name} from watchlist`}
                      onClick={() => remove(v.airportId)}
                    >
                      Remove
                    </Button>
                  </div>
                  {v.explanation !== null ? <p className="watch-list__why">{v.explanation}</p> : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
