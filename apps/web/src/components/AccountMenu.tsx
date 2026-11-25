import { useEffect, useId, useRef, useState } from "react";
import { SignOutButton } from "./SignOutButton";

export interface AccountMenuProps {
  /** Current location pathname; the Settings link gets aria-current="page" on /settings. */
  pathname: string;
}

/**
 * Account disclosure for signed-in visitors. The button toggles a panel with a Settings link
 * and Sign out. Escape closes the panel and returns focus to the button; a pointer press
 * outside the menu closes it.
 */
export function AccountMenu({ pathname }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLLIElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  return (
    <li
      ref={rootRef}
      className="account-menu nav-bar__auth"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          buttonRef.current?.focus();
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="account-menu__button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        Account
      </button>
      {open ? (
        <ul id={panelId} className="account-menu__panel">
          <li>
            <a href="/settings#account" aria-current={pathname === "/settings" ? "page" : undefined}>
              Settings
            </a>
          </li>
          <li>
            <SignOutButton />
          </li>
        </ul>
      ) : null}
    </li>
  );
}
