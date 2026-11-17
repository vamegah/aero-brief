/** Formats an ISO timestamp as "YYYY-MM-DD HH:MM UTC". Returns the input unchanged if unparseable. */
export function formatUtc(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return iso;
  return `${new Date(time).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
