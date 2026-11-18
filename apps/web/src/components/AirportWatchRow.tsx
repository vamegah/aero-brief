import { Button } from "./Button";
import { StatusPill } from "./StatusPill";

export interface AirportWatchRowProps {
  airportId: string;
  name: string;
  watching: boolean;
  disabled: boolean;
  onAdd: (airportId: string) => void;
  onRemove: (airportId: string) => void;
}

/** One airport row: a status pill ("Watching" / "Not watching") plus a single add or remove button. */
export function AirportWatchRow({ airportId, name, watching, disabled, onAdd, onRemove }: AirportWatchRowProps) {
  return (
    <tr>
      <th scope="row">
        {name} ({airportId})
      </th>
      <td>
        <StatusPill variant={watching ? "normal" : "neutral"} text={watching ? "Watching" : "Not watching"} />
      </td>
      <td>
        {watching ? (
          <Button
            variant="secondary"
            disabled={disabled}
            aria-label={`Remove ${name} from watchlist`}
            onClick={() => onRemove(airportId)}
          >
            Remove
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={disabled}
            aria-label={`Add ${name} to watchlist`}
            onClick={() => onAdd(airportId)}
          >
            Add
          </Button>
        )}
      </td>
    </tr>
  );
}
