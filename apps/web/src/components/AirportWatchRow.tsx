import type { AirportStatusKind } from "@aerobrief/core/status-derivation";
import { AirportStatusPill } from "./AirportStatusPill";
import { Button } from "./Button";
import { StatusPill } from "./StatusPill";

export interface AirportWatchRowProps {
  airportId: string;
  name: string;
  watching: boolean;
  /** Derived status for this airport. Omit when there is no status response; only the Watching pill shows. */
  statusKind?: AirportStatusKind;
  disabled: boolean;
  onAdd: (airportId: string) => void;
  onRemove: (airportId: string) => void;
}

/** One airport row: a status pill ("Watching" / "Not watching") plus the derived status pill (when known) and a single add or remove button. */
export function AirportWatchRow({ airportId, name, watching, statusKind, disabled, onAdd, onRemove }: AirportWatchRowProps) {
  return (
    <tr>
      <th scope="row">
        {name} ({airportId})
      </th>
      <td>
        <StatusPill variant={watching ? "normal" : "neutral"} text={watching ? "Watching" : "Not watching"} />
        {statusKind === undefined ? null : statusKind === "normal" ? (
          <StatusPill variant="normal" text="Operating normally" />
        ) : statusKind === "ground_stop" ? (
          <StatusPill variant="active" text="Ground stop" />
        ) : (
          <AirportStatusPill kind={statusKind} />
        )}
      </td>
      <td>
        {watching ? (
          <Button
            variant="ghost"
            disabled={disabled}
            aria-label={`Remove ${name} from watchlist`}
            onClick={() => onRemove(airportId)}
          >
            Remove
          </Button>
        ) : (
          <Button
            variant="secondary"
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
