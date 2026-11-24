import { SECTION_LABELS, type SectionId } from "../lib/settings-sections";
import { SectionMenu } from "./SectionMenu";

export interface SettingsMenuProps {
  sections: readonly SectionId[];
  active: SectionId;
}

export function SettingsMenu({ sections, active }: SettingsMenuProps) {
  return (
    <SectionMenu
      ariaLabel="Settings sections"
      className="settings-menu"
      items={sections.map((id) => ({ id, label: SECTION_LABELS[id] }))}
      active={active}
    />
  );
}
