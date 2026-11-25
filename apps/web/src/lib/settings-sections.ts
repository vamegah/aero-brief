import type { Features } from "../features/features-schema";

export const SECTION_IDS = ["display", "digest", "webhooks", "account"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const SECTION_LABELS: Readonly<Record<SectionId, string>> = {
  display: "Display",
  digest: "Daily digest",
  webhooks: "Webhooks",
  account: "Account",
};

/**
 * Visible sections in fixed order. "display" and "account" are always present (the time
 * preference is not a Phase 2 flag), so the list is never empty.
 */
export function visibleSections(features: Features): SectionId[] {
  return SECTION_IDS.filter((id) => {
    if (id === "digest") return features.digests;
    if (id === "webhooks") return features.webhooks;
    return true;
  });
}

/** `hash` is `window.location.hash`, for example "#webhooks". Any other input falls back to the first visible section. */
export function resolveSection(hash: string, visible: readonly SectionId[]): SectionId {
  const wanted = hash.startsWith("#") ? hash.slice(1) : hash;
  const match = visible.find((id) => id === wanted);
  return match ?? visible[0] ?? "account";
}
