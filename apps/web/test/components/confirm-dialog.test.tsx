import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";

const proto = HTMLDialogElement.prototype as Partial<HTMLDialogElement>;
const original = { showModal: proto.showModal, close: proto.close };

afterEach(() => {
  proto.showModal = original.showModal;
  proto.close = original.close;
});

function Harness({ onConfirm = () => undefined }: { onConfirm?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Delete account
      </button>
      <ConfirmDialog
        open={open}
        label="Confirm account deletion"
        title="Delete your account?"
        confirmLabel="Confirm delete account"
        cancelLabel="Cancel"
        onConfirm={onConfirm}
        onCancel={() => setOpen(false)}
      >
        This removes your watchlist.
      </ConfirmDialog>
    </>
  );
}

describe("ConfirmDialog", () => {
  it("opens a native dialog with a labelled button group when open (showModal missing)", () => {
    proto.showModal = undefined;
    render(<Harness />);
    expect(screen.queryByRole("group")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    const group = screen.getByRole("group", { name: "Confirm account deletion" });
    expect(group.querySelector("button")?.textContent).toBe("Confirm delete account");
    expect(screen.getByRole("button", { name: "Cancel" })).not.toBeNull();
    expect(screen.getByText("This removes your watchlist.")).not.toBeNull();
    expect(document.querySelector("dialog")?.hasAttribute("open")).toBe(true);
  });

  it("uses showModal when available, and Cancel closes it and returns focus to the trigger", () => {
    const showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    proto.showModal = showModal;
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Delete account" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(showModal).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.querySelector("dialog")?.hasAttribute("open")).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("calls onCancel on the dialog's cancel event (Escape) and onConfirm on confirm", () => {
    proto.showModal = undefined;
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete account" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent(document.querySelector("dialog") as HTMLDialogElement, new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("group")).toBeNull();
  });
});
