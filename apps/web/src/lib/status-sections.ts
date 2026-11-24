export const STATUS_SECTION_IDS = ["overview", "events", "airports"] as const;
export type StatusSectionId = (typeof STATUS_SECTION_IDS)[number];

export const STATUS_SECTION_LABELS: Readonly<Record<StatusSectionId, string>> = {
  overview: "Overview",
  events: "Events",
  airports: "Airports",
};

/** `hash` is `window.location.hash`. Any value that does not name a section resolves to "overview". */
export function resolveStatusSection(hash: string): StatusSectionId {
  const wanted = hash.startsWith("#") ? hash.slice(1) : hash;
  return STATUS_SECTION_IDS.find((id) => id === wanted) ?? "overview";
}
