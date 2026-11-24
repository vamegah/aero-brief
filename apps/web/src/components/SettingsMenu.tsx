import { SECTION_LABELS, type SectionId } from "../lib/settings-sections";

export interface SettingsMenuProps {
  sections: readonly SectionId[];
  active: SectionId;
}

/** Native hash links only: Tab moves between links, Enter follows one, and focus stays on it. */
export function SettingsMenu({ sections, active }: SettingsMenuProps) {
  return (
    <nav aria-label="Settings sections" className="settings-menu">
      <ul className="settings-menu__list">
        {sections.map((id) => (
          <li key={id}>
            <a href={`#${id}`} aria-current={id === active ? "true" : undefined}>
              {SECTION_LABELS[id]}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
