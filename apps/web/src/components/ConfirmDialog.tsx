import { useEffect, useRef } from "react";
import type { ReactNode, SyntheticEvent } from "react";
import { Button } from "./Button";

export interface ConfirmDialogProps {
  open: boolean;
  /** Accessible name of the button group, for example "Confirm account deletion". */
  label: string;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Native <dialog> opened with showModal(). Escape (the dialog's cancel event) calls onCancel and
 * focus returns to the element that was focused when the dialog opened. Where showModal is not
 * implemented (jsdom), the `open` attribute is set instead so role queries still see the content.
 */
export function ConfirmDialog({
  open,
  label,
  title,
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) {
      if (dialog.hasAttribute("open")) return;
      trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (dialog.hasAttribute("open")) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
      trigger.current?.focus();
      trigger.current = null;
    }
  }, [open]);

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault(); // the parent controls `open`
    onCancel();
  };

  return (
    <dialog ref={ref} className="confirm-dialog" aria-labelledby="confirm-dialog-title" onCancel={handleCancel}>
      {open ? (
        <>
          <h3 id="confirm-dialog-title" className="confirm-dialog__title">
            {title}
          </h3>
          {children ? <div className="confirm-dialog__body">{children}</div> : null}
          <div role="group" aria-label={label} className="confirm-dialog__actions">
            <Button variant="danger" onClick={onConfirm}>
              {confirmLabel}
            </Button>
            <Button variant="secondary" onClick={onCancel}>
              {cancelLabel}
            </Button>
          </div>
        </>
      ) : null}
    </dialog>
  );
}
