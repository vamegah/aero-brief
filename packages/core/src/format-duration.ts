/**
 * Short duration text from milliseconds, floored to whole minutes:
 * "less than 1 min", "45 min", "1 h 20 min", "2 h". Negative or non-finite input counts as 0.
 * The one formatter shared by the incident card and the structured explanation. Pure.
 */
export function formatDurationText(ms: number): string {
  const totalMinutes = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / 60_000);
  if (totalMinutes < 1) return "less than 1 min";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}
