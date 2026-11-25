import { useId, useState } from "react";
import { airportById, isMonitoredId } from "@aerobrief/core/airports";
import { explainStructured } from "@aerobrief/core/explain";
import type { Incident } from "@aerobrief/core/incidents";
import { useNow } from "../hooks/use-minute-ticker";
import { formatDuration } from "../lib/ground-stop-durations";
import { AirportStatusPill } from "./AirportStatusPill";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { StructuredExplanation } from "./StructuredExplanation";
import { TimeText } from "./TimeText";

/** The FAA NAS Status site. A link only: no FAA text is copied into the card. */
export const FAA_NAS_STATUS_URL = "https://nasstatus.faa.gov/";

export interface IncidentRecovery {
  /** "Ended 2 h 5 min ago". */
  sinceText?: string;
  /** "AeroBrief estimate: ..." with its basis. */
  estimateText?: string;
}

export interface IncidentCardProps {
  /** One merged incident from `mergeIncidents`. The parent merges and sorts. */
  incident: Incident;
  /** FAA reason text of an active ground stop, when the parent has it. Never shown as is. */
  reason?: string | null;
  /** ISO time of the FAA expected end, when announced. */
  expectedEnd?: string | null;
  /** Set only when the airport is Recovering from this incident. */
  recovery?: IncidentRecovery;
  /** Current time; tests pass a fixed value. */
  now?: Date;
}

/** "1 h 20 min", "45 min", "less than 1 min". */
export function formatElapsed(ms: number): string {
  const totalMinutes = Math.floor(Math.max(0, ms) / 60_000);
  if (totalMinutes < 1) return "less than 1 min";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/** True when `mergeIncidents` built the incident from an end event alone (its start is unknown). */
function startUnknown(incident: Incident): boolean {
  return incident.endedAt !== null && incident.durationMs === 0 && incident.startedAt === incident.endedAt;
}

/**
 * One card per incident (Requirement 2). Active: severity icon, "Active" label and elapsed time.
 * Ended: neutral resolved style, check icon, "Ended" label and total duration. The native button
 * expands a timeline, the recovery status, the structured explanation and a link to the FAA site.
 */
export function IncidentCard({ incident, reason = null, expectedEnd = null, recovery, now }: IncidentCardProps) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const tickMs = useNow();
  const current = now ?? new Date(tickMs);

  const active = incident.endedAt === null;
  const nationwide = incident.type === "NATIONWIDE_EVENT";
  const typeLabel = nationwide ? "System-wide disruption" : "Ground stop";
  const stateIcon: IconName = !active ? "check" : nationwide ? "warning-triangle" : "stop-octagon";
  const stateLabel = active ? "Active" : "Ended";
  const code = incident.airportId;
  const airport = code !== null && isMonitoredId(code) ? airportById(code) : null;
  const unknownStart = startUnknown(incident);

  let durationText: string | null = null;
  if (active) {
    const started = Date.parse(incident.startedAt);
    if (!Number.isNaN(started)) durationText = `Active for ${formatElapsed(current.getTime() - started)}`;
  } else if (incident.durationMs !== null && !unknownStart) {
    durationText = formatDuration(incident.durationMs);
  }

  return (
    <div className={`event-card incident-card event-card--${active ? "active" : "resolved"}`}>
      <div className="event-card__header">
        <div className="event-card__title">
          <Icon name={stateIcon} />
          <span className="event-card__type incident-card__state">{stateLabel}</span>
          <span className="incident-card__type">{typeLabel}</span>
          {code !== null ? (
            <strong className="event-card__airport">
              <a href={`/airport/${code}`}>{code}</a>
            </strong>
          ) : null}
          {airport !== null ? <span className="incident-card__airport-name">{airport.name}</span> : null}
        </div>
        {durationText !== null ? <p className="event-card__duration incident-card__duration">{durationText}</p> : null}
      </div>
      <Button
        variant="ghost"
        className="incident-card__toggle"
        aria-expanded={open}
        {...(open ? { "aria-controls": detailsId } : {})}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Hide details" : "Show details"}
      </Button>
      {open ? (
        <div id={detailsId} className="incident-card__details">
          <ol className="incident-card__timeline" aria-label="Timeline">
            <li>
              <span className="incident-card__timeline-label">Started</span>{" "}
              {unknownStart ? (
                <span>Not available (before the last 24 hours)</span>
              ) : (
                <TimeText iso={incident.startedAt} {...(code !== null ? { airportId: code } : {})} />
              )}
            </li>
            <li>
              <span className="incident-card__timeline-label">Ended</span>{" "}
              {incident.endedAt === null ? (
                <span>Still active</span>
              ) : (
                <TimeText iso={incident.endedAt} {...(code !== null ? { airportId: code } : {})} />
              )}
            </li>
          </ol>
          {recovery !== undefined ? (
            <div className="incident-card__recovery">
              <AirportStatusPill kind="recovering" />
              {recovery.sinceText !== undefined ? <p>{recovery.sinceText}</p> : null}
              {recovery.estimateText !== undefined ? <p>{recovery.estimateText}</p> : null}
            </div>
          ) : null}
          <StructuredExplanation explanation={explainStructured(incident, reason, expectedEnd, current)} />
          <p className="incident-card__source">
            <a href={FAA_NAS_STATUS_URL} target="_blank" rel="noopener noreferrer">
              View the FAA NAS Status site
            </a>
          </p>
        </div>
      ) : null}
    </div>
  );
}
