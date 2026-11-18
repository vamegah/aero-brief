import type { EventSummary } from "../api/client";

export const CSV_HEADER = "time_utc,type,airport,explanation";

/** UTF-8 byte order mark. Prepended by the download, not by `eventsToCsv`, so the CSV text stays plain RFC 4180. */
export const CSV_BOM = "\uFEFF";

/** Characters that make a spreadsheet treat a cell as a formula. Tab and CR are included (OWASP CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

function field(value: string): string {
  const guarded = FORMULA_START.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function utcTime(occurredAt: string): string {
  const date = new Date(occurredAt);
  return Number.isNaN(date.getTime()) ? occurredAt : date.toISOString();
}

/** RFC 4180 text (CRLF line endings, every field quoted) for the given events, in the given order. */
export function eventsToCsv(events: readonly EventSummary[]): string {
  const rows = events.map((e) =>
    [utcTime(e.occurredAt), e.type, e.airportId ?? "", e.explanation].map(field).join(","),
  );
  return [CSV_HEADER, ...rows].join("\r\n") + "\r\n";
}
