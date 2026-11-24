import { useState } from "react";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";

export interface AccountSectionProps {
  removeAccount: () => Promise<boolean>;
  onDeleted: () => void;
}

export function AccountSection({ removeAccount, onDeleted }: AccountSectionProps) {
  const [confirming, setConfirming] = useState(false);

  async function onConfirmDelete() {
    if (await removeAccount()) onDeleted();
    else setConfirming(false);
  }

  return (
    <section className="account-section" aria-labelledby="account-heading">
      <h3 id="account-heading">Account</h3>
      <p className="account-section__help">Permanently delete your account and watchlist.</p>
      <Button variant="danger-outline" onClick={() => setConfirming(true)}>
        Delete account
      </Button>
      <ConfirmDialog
        open={confirming}
        label="Confirm account deletion"
        title="Delete your account?"
        confirmLabel="Confirm delete account"
        cancelLabel="Cancel"
        onConfirm={() => void onConfirmDelete()}
        onCancel={() => setConfirming(false)}
      >
        Delete your account and all your watchlist data? This cannot be undone.
      </ConfirmDialog>
    </section>
  );
}
