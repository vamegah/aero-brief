export interface AirportWatchRowProps {
  airportId: string;
  name: string;
  watching: boolean;
  disabled: boolean;
  onAdd: (airportId: string) => void;
  onRemove: (airportId: string) => void;
}

/** One airport row: text label ("Watching" / "Not watching") plus an add or remove button. */
export function AirportWatchRow({ airportId, name, watching, disabled, onAdd, onRemove }: AirportWatchRowProps) {
  return (
    <tr>
      <th scope="row">
        {name} ({airportId})
      </th>
      <td>
        <span className={watching ? "status status--clear" : "status"}>{watching ? "Watching" : "Not watching"}</span>
      </td>
      <td>
        {watching ? (
          <button
            type="button"
            disabled={disabled}
            aria-label={`Remove ${name} from watchlist`}
            onClick={() => onRemove(airportId)}
          >
            Remove
          </button>
        ) : (
          <button type="button" disabled={disabled} aria-label={`Add ${name} to watchlist`} onClick={() => onAdd(airportId)}>
            Add
          </button>
        )}
      </td>
    </tr>
  );
}
