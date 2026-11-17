/**
 * Browser-side API client. Response types mirror `NationalStatusResponse` and
 * `AirportStatusResponse` in design.md (and apps/api/src/handlers/status.ts). They are
 * redeclared here on purpose: the web app never imports apps/api or packages/db.
 */

export const REQUEST_TIMEOUT_MS = 10_000;

export type AirportSummary = {
  airportId: string;
  name: string;
  groundStop: { reasonText: string } | null;
};

export type EventSummary = {
  type: string;
  airportId: string | null;
  occurredAt: string;
  explanation: string;
};

export type NationalStatusResponse =
  | { state: "no_data"; message: string }
  | {
      state: "ok";
      capturedAt: string;
      stale: boolean;
      airports: AirportSummary[];
      nationwide: { active: boolean; count: number; artccs: string[]; explanation: string | null };
      events: EventSummary[];
    };

export type AirportStatusResponse =
  | { state: "no_data"; message: string }
  | {
      state: "ok";
      capturedAt: string;
      stale: boolean;
      airport: AirportSummary;
      events: EventSummary[];
    };

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAirportSummary(value: unknown): value is AirportSummary {
  if (!isRecord(value)) return false;
  const stop = value["groundStop"];
  return (
    typeof value["airportId"] === "string" &&
    typeof value["name"] === "string" &&
    (stop === null || (isRecord(stop) && typeof stop["reasonText"] === "string"))
  );
}

function isEventSummary(value: unknown): value is EventSummary {
  return (
    isRecord(value) &&
    typeof value["type"] === "string" &&
    (value["airportId"] === null || typeof value["airportId"] === "string") &&
    typeof value["occurredAt"] === "string" &&
    typeof value["explanation"] === "string"
  );
}

function isNationwide(value: unknown): value is { active: boolean; count: number; artccs: string[]; explanation: string | null } {
  return (
    isRecord(value) &&
    typeof value["active"] === "boolean" &&
    typeof value["count"] === "number" &&
    Array.isArray(value["artccs"]) &&
    value["artccs"].every((a) => typeof a === "string") &&
    (value["explanation"] === null || typeof value["explanation"] === "string")
  );
}

/** Runtime check that an untrusted JSON body is a `NationalStatusResponse`. */
export function isNationalStatusResponse(value: unknown): value is NationalStatusResponse {
  if (!isRecord(value)) return false;
  if (value["state"] === "no_data") return typeof value["message"] === "string";
  return (
    value["state"] === "ok" &&
    typeof value["capturedAt"] === "string" &&
    typeof value["stale"] === "boolean" &&
    Array.isArray(value["airports"]) &&
    value["airports"].every(isAirportSummary) &&
    isNationwide(value["nationwide"]) &&
    Array.isArray(value["events"]) &&
    value["events"].every(isEventSummary)
  );
}

/** Aborts when either signal aborts. */
function anySignal(a: AbortSignal, b: AbortSignal | undefined): AbortSignal {
  return b === undefined ? a : AbortSignal.any([a, b]);
}

/**
 * GET /api/status/national. Aborts after 10 s, or earlier if `signal` aborts.
 * Rejects with `ApiRequestError` on a non-2xx status or a malformed body.
 */
export async function fetchNationalStatus(signal?: AbortSignal): Promise<NationalStatusResponse> {
  const combined = anySignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS), signal);
  const response = await fetch("/api/status/national", {
    headers: { Accept: "application/json" },
    signal: combined,
  });
  if (!response.ok) {
    throw new ApiRequestError(`Status request failed with HTTP ${response.status}.`, response.status);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiRequestError("Status response was not valid JSON.", response.status);
  }
  if (!isNationalStatusResponse(body)) {
    throw new ApiRequestError("Status response had an unexpected shape.", response.status);
  }
  return body;
}
