/** `aerobrief-<ID>-<YYYY-MM-DD>.csv`, dated in UTC. */
export function csvFileName(airportId: string, now: Date): string {
  return `aerobrief-${airportId}-${now.toISOString().slice(0, 10)}.csv`;
}

/** Saves text as a file through a Blob, an object URL and a temporary link. Makes no network request. */
export function downloadTextFile(fileName: string, text: string, mimeType = "text/csv;charset=utf-8"): void {
  if (typeof URL.createObjectURL !== "function") return;
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
}
