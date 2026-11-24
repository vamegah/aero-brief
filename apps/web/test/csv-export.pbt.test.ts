import fc from "fast-check";
import { describe, it } from "vitest";
import { eventsToCsv } from "../src/lib/events-to-csv";

/** Tiny RFC 4180 parser: quoted fields only, CRLF rows. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (quoted) {
      if (ch === '"' && text.charAt(i + 1) === '"') {
        value += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else value += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(value);
      value = "";
    } else if (ch === "\r" && text.charAt(i + 1) === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      i++;
    } else value += ch;
  }
  return rows;
}

const text = fc.oneof(
  fc.string({ maxLength: 20 }),
  fc
    .tuple(fc.constantFrom("=", "+", "-", "@", "\t", "\r"), fc.string({ maxLength: 10 }))
    .map(([c, s]) => c + s),
  fc.constantFrom('a"b', "x,y", "line1\nline2", "=1+1", "@cmd", "-5", "+1", ""),
);

const event = fc.record({
  incidentKey: text,
  type: text,
  airportId: fc.option(text, { nil: null }),
  occurredAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2030-01-01"), noInvalidDate: true }).map((d) => d.toISOString()),
  explanation: text,
});

const FORMULA = /^[=+\-@\t\r]/;

describe("eventsToCsv properties", () => {
  /** **Validates: Requirements 18.7** */
  it("round-trips every field, adding only the formula apostrophe, and no field starts with a formula character", () => {
    fc.assert(
      fc.property(fc.array(event, { maxLength: 8 }), (events) => {
        const rows = parseCsv(eventsToCsv(events));
        if (rows.length !== events.length + 1) return false;
        if (rows[0]?.join(",") !== "time_utc,type,airport,explanation") return false;
        return events.every((e, i) => {
          const got = rows[i + 1];
          const want = [e.occurredAt, e.type, e.airportId ?? "", e.explanation].map((v) => (FORMULA.test(v) ? `'${v}` : v));
          return (
            got !== undefined &&
            got.length === 4 &&
            got.every((f, k) => f === want[k] && !FORMULA.test(f))
          );
        });
      }),
      { numRuns: 200 },
    );
  });
});
