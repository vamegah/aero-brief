import { useId, useState, type KeyboardEvent } from "react";
import { airportTimeZone } from "@aerobrief/core/airport-time-zones";
import { isMonitoredId } from "@aerobrief/core/airports";
import { useDisplayMode } from "../hooks/use-display-mode";
import { useNow } from "../hooks/use-minute-ticker";
import { formatTimeText, formatTooltip } from "../lib/time-text";

export type TimeTextProps = {
  /** ISO 8601 timestamp. Rendered unchanged as the `dateTime` attribute. */
  iso: string;
  /** Airport code used for the "Airport local" line. UTC is used when absent or unknown. */
  airportId?: string;
};

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * A `<time dateTime>` with a tooltip that lists airport local, your local and UTC time.
 * The tooltip opens on hover, focus and tap, closes on Escape, and is linked with
 * aria-describedby, so keyboard and screen reader users get it too.
 */
export function TimeText({ iso, airportId }: TimeTextProps) {
  const id = useId();
  const mode = useDisplayMode();
  const now = useNow();
  const [open, setOpen] = useState(false);

  const airportTz = airportId !== undefined && isMonitoredId(airportId) ? airportTimeZone(airportId) : "UTC";
  const userTz = browserTimeZone();

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <span className="time-text">
      <time
        className="time-text__value"
        dateTime={iso}
        tabIndex={0}
        aria-describedby={id}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
      >
        {formatTimeText(iso, now, mode, airportTz, userTz)}
      </time>
      <span id={id} role="tooltip" className="time-text__tooltip" hidden={!open}>
        {formatTooltip(iso, airportTz, userTz)}
      </span>
    </span>
  );
}
