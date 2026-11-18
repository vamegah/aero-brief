import { z } from "zod";
import { type MonitoredId, isMonitoredId } from "./airports";

/**
 * FAA payload schemas. They validate only what AeroBrief consumes. Unknown keys
 * are stripped (Zod's default), so FAA adding fields never causes a failure.
 */
export const FaaGroundStopSchema = z.object({
  id: z.union([z.string(), z.number()]).nullish(),
  startTime: z.string().nullish(),
  impactingCondition: z.string().nullish(),
  center: z.string().nullish(),
  endTime: z.string().nullish(),
  programExpirationTime: z.string().nullish(),
  advisoryUrl: z.string().nullish(),
});

export const FaaAirportEventSchema = z.object({
  airportId: z.string().min(1),
  airportLongName: z.string().nullish(),
  groundStop: FaaGroundStopSchema.nullish(),
});

/** Top level is an array. An empty array is valid ("no events anywhere"). */
export const FaaResponseSchema = z.array(FaaAirportEventSchema);

export type FaaGroundStop = z.infer<typeof FaaGroundStopSchema>;
export type FaaAirportEvent = z.infer<typeof FaaAirportEventSchema>;
export type FaaResponse = z.infer<typeof FaaResponseSchema>;

/** Internal (stored) Snapshot schemas. */
export const idSourceSchema = z.enum(["faa_id", "start_time", "first_seen"]);

export const GroundStopInfoSchema = z.object({
  faaEventId: z.string().min(1),
  idSource: idSourceSchema,
  reason: z.string().nullable(),
  center: z.string().nullable(),
  endTime: z.string().nullable(),
  /** ISO UTC expected end (endTime, else programExpirationTime). Old Snapshots lack it. */
  expectedEnd: z.string().nullable().default(null),
  /** Validated FAA advisory link (https, faa.gov only). Old Snapshots lack it. */
  advisoryUrl: z.string().nullable().default(null),
});

const monitoredIdSchema = z.custom<MonitoredId>(
  (v) => typeof v === "string" && isMonitoredId(v),
  { message: "Not a monitored airport id" },
);

export const AirportStatusSchema = z.object({
  airportId: monitoredIdSchema,
  groundStop: GroundStopInfoSchema.nullable(), // null = no active ground stop
});

export const SnapshotSchema = z.object({
  id: z.string().uuid(),
  capturedAt: z.string().datetime({ offset: false }),
  airports: z
    .array(AirportStatusSchema)
    .length(20)
    .refine((a) => new Set(a.map((x) => x.airportId)).size === 20, {
      message: "Airport ids must be unique",
    })
    .readonly(),
});

export type IdSource = z.infer<typeof idSourceSchema>;
export type GroundStopInfo = z.infer<typeof GroundStopInfoSchema>;
export type AirportStatus = z.infer<typeof AirportStatusSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;

export type FaaParseIssue = { path: string; message: string };

export type FaaParseResult =
  | { kind: "ok"; response: FaaResponse }
  | { kind: "unparseable"; detail: string }
  | { kind: "validation"; detail: string; issues: FaaParseIssue[] };

/** Validate an already-decoded value. Never throws. */
export function parseFaaResponse(value: unknown): Exclude<FaaParseResult, { kind: "unparseable" }> {
  const result = FaaResponseSchema.safeParse(value);
  if (result.success) return { kind: "ok", response: result.data };
  const issues: FaaParseIssue[] = result.error.issues.map((i) => ({
    path: i.path.map(String).join("."),
    message: i.message,
  }));
  const detail = issues
    .slice(0, 5)
    .map((i) => (i.path === "" ? i.message : `${i.path}: ${i.message}`))
    .join("; ");
  return { kind: "validation", detail, issues };
}

/** Parse a raw FAA response body. Never throws. */
export function parseFaaBody(text: string): FaaParseResult {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch (err) {
    return { kind: "unparseable", detail: err instanceof Error ? err.message : "Invalid JSON" };
  }
  return parseFaaResponse(decoded);
}
