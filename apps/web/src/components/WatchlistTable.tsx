import { AirportWatchRow } from "./AirportWatchRow";

export interface WatchlistTableProps {
  /** Airport ids and names to list (the 30 monitored airports from the status response). */
  airports: { airportId: string; name: string }[];
  watchlist: readonly string[];
  disabled: boolean;
  onAdd: (airportId: string) => void;
  onRemove: (airportId: string) => void;
}

export function WatchlistTable({ airports, watchlist, disabled, onAdd, onRemove }: WatchlistTableProps) {
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
            disabled={disabled}
            onAdd={onAdd}
            onRemove={onRemove}
          />
        ))}
      </tbody>
    </table>
  );
}
