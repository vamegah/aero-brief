import { useId, useRef, useState } from "react";
import { useSession } from "../hooks/use-session";
import { AccountMenu } from "./AccountMenu";

export interface NavBarProps {
  /** Current location pathname; the matching link gets aria-current="page". */
  pathname: string;
}

const LINKS = [
  { href: "/", label: "Status" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/settings", label: "Settings" },
] as const;

export function NavBar({ pathname }: NavBarProps) {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const current = (href: string) => (pathname === href ? ("page" as const) : undefined);
  // The account menu holds Settings once signed in, so the plain link would repeat it.
  const links = session === "signed-in" ? LINKS.filter(({ href }) => href !== "/settings") : LINKS;

  return (
    <nav
      aria-label="Main"
      className="nav-bar"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          toggleRef.current?.focus();
        }
      }}
    >
      {/* Shown below 768px only (CSS). At that width the list is collapsed until toggled. */}
      <button
        ref={toggleRef}
        type="button"
        className="nav-bar__toggle"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        Menu
      </button>
      <ul id={listId} className={open ? "nav-bar__list" : "nav-bar__list nav-bar__list--collapsed"}>
        {links.map(({ href, label }) => (
          <li key={href}>
            <a href={href} aria-current={current(href)}>
              {label}
            </a>
          </li>
        ))}
        {session === "signed-out" ? (
          <li className="nav-bar__auth">
            <a href="/sign-in" className="btn btn--secondary nav-bar__signin" aria-current={current("/sign-in")}>
              Sign in
            </a>
          </li>
        ) : null}
        {session === "signed-in" ? <AccountMenu pathname={pathname} /> : null}
      </ul>
    </nav>
  );
}
