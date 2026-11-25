import type { DerivedAirportStatus } from "@aerobrief/core/status-derivation";
import { AirportWatchRow } from "./AirportWatchRow";

export interface WatchlistTableProps {
  /** Airport ids and names to list (the 30 monitored airports from the status response). */
  airports: { airportId: string; name: string }[];
  watchlist: readonly string[];
  /** Output of `airportStatusById`. Omit when there is no status response. */
  statusById?: ReadonlyMap<string, DerivedAirportStatus>;
  disabled: boolean;
  onAdd: (airportId: string) => void;
  onRemove: (airportId: string) => void;
}

export function WatchlistTable({ airports, watchlist, statusById, disabled, onAdd, onRemove }: WatchlistTableProps) {
  return (
    <table className="airport-table airport-table--watchlist">
      <caption>Airports you can watch</caption>
      <thead>
        <tr>
          <th scope="col">Airport</th>
          <th scope="col">Status</th>
          <th scope="col">Action</th>
        </tr>
      </thead>
      <tbody>
        {airports.map((a) => (
          <AirportWatchRow
            key={a.airportId}
            airportId={a.airportId}
            name={a.name}
            watching={watchlist.includes(a.airportId)}
            statusKind={statusById?.get(a.airportId)?.kind}
            disabled={disabled}
            onAdd={onAdd}
            onRemove={onRemove}
          />
        ))}
      </tbody>
    </table>
  );
}
