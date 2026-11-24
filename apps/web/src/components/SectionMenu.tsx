export interface SectionMenuItem {
  id: string;
  label: string;
}

export interface SectionMenuProps {
  /** Accessible name of the `<nav>`. */
  ariaLabel: string;
  items: readonly SectionMenuItem[];
  active: string;
  /** Extra class on the `<nav>`, for example "settings-menu". */
  className?: string;
}

/** Native hash links only: Tab moves between links, Enter follows one, and focus stays on it. */
export function SectionMenu({ ariaLabel, items, active, className }: SectionMenuProps) {
  return (
    <nav aria-label={ariaLabel} className={className ? `section-menu ${className}` : "section-menu"}>
      <ul className="section-menu__list">
        {items.map(({ id, label }) => (
          <li key={id}>
            <a href={`#${id}`} aria-current={id === active ? "true" : undefined}>
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
