import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountSection } from "../../src/components/AccountSection";

const proto = HTMLDialogElement.prototype as Partial<HTMLDialogElement>;
const original = { showModal: proto.showModal, close: proto.close };

beforeEach(() => {
  proto.showModal = undefined;
});

afterEach(() => {
  proto.showModal = original.showModal;
  proto.close = original.close;
});

function open() {
  fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
}

describe("AccountSection", () => {
  it("renders the labelled section, help text and a closed dialog", () => {
    render(<AccountSection removeAccount={async () => true} onDeleted={() => undefined} />);
    const section = screen.getByRole("region", { name: "Account" });
    expect(section.querySelector("h3")?.textContent).toBe("Account");
    expect(screen.getByText("Permanently delete your account and watchlist.")).not.toBeNull();
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("opens the dialog and Cancel closes it without deleting", () => {
    const removeAccount = vi.fn(async () => true);
    render(<AccountSection removeAccount={removeAccount} onDeleted={() => undefined} />);
    open();
    expect(screen.getByRole("group", { name: "Confirm account deletion" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group")).toBeNull();
    expect(removeAccount).not.toHaveBeenCalled();
  });

  it("Confirm calls removeAccount, then onDeleted when it returns true", async () => {
    const calls: string[] = [];
    const removeAccount = vi.fn(async () => {
      calls.push("remove");
      return true;
    });
    const onDeleted = vi.fn(() => {
      calls.push("deleted");
    });
    render(<AccountSection removeAccount={removeAccount} onDeleted={onDeleted} />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete account" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(calls).toEqual(["remove", "deleted"]);
  });

  it("closes the dialog and does not call onDeleted when removeAccount returns false", async () => {
    const removeAccount = vi.fn(async () => false);
    const onDeleted = vi.fn();
    render(<AccountSection removeAccount={removeAccount} onDeleted={onDeleted} />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete account" }));
    await waitFor(() => expect(removeAccount).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("group")).toBeNull());
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
