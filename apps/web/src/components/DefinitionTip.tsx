import { useId, useState, type KeyboardEvent } from "react";

export type DefinitionTipProps = {
  /** Visible, focusable trigger text, for example "What is a region?". */
  label: string;
  /** The definition shown in the tooltip and read by screen readers. */
  definition: string;
};

/**
 * A focusable trigger with a tooltip definition, same pattern as TimeText: opens on hover, focus
 * and click, closes on Escape, linked with aria-describedby so keyboard and screen reader users get it.
 */
export function DefinitionTip({ label, definition }: DefinitionTipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <span className="time-text definition-tip">
      <button
        type="button"
        className="definition-tip__trigger"
        aria-describedby={id}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
      >
        {label}
      </button>
      <span id={id} role="tooltip" className="time-text__tooltip definition-tip__text" hidden={!open}>
        {definition}
      </span>
    </span>
  );
}
