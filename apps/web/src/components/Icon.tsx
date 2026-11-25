export const ICON_NAMES = [
  "plane",
  "check",
  "alert",
  "info",
  "error",
  "loading",
  "empty",
  // Airport_Status kinds (STATUS_CATALOG icons)
  "info-circle",
  "warning-triangle",
  "stop-octagon",
  "clock-arrow",
  "question-mark",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/**
 * Decorative icon: an empty aria-hidden span whose glyph is an inline SVG data URI applied with
 * CSS mask-image (see primitives.css). It never renders <svg> or <img>, so it is safe inside
 * StatusView, and it adds no text to its parent.
 */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  const classes = ["icon", `icon--${name}`, className].filter(Boolean).join(" ");
  return <span aria-hidden="true" className={classes} />;
}
