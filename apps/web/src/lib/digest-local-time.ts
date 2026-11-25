function formatter(timeZone: string): Intl.DateTimeFormat {
  const options: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", hour12: true };
  try {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone });
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" });
  }
}

/** The given UTC hour on the reference date's UTC day, shown in `timeZone` (e.g. "5:00 PM"). */
export function localHourLabel(hour: number, timeZone: string, referenceDate: Date): string {
  const instant = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate(), hour),
  );
  const parts = formatter(timeZone).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("hour")}:${get("minute")} ${get("dayPeriod")}`;
}

/** e.g. "01:00 UTC (5:00 PM your time)". */
export function hourWithLocalEquivalent(hour: number, timeZone: string, referenceDate: Date): string {
  const utc = `${String(hour).padStart(2, "0")}:00 UTC`;
  return `${utc} (${localHourLabel(hour, timeZone, referenceDate)} your time)`;
}
