import { useSession } from "../hooks/use-session";
import { SignOutButton } from "./SignOutButton";

export interface NavBarProps {
  /** Current location pathname; the matching link gets aria-current="page". */
  pathname: string;
}

const LINKS = [
  { href: "/", label: "Status" },
  { href: "/watchlist", label: "Watchlist" },
] as const;

export function NavBar({ pathname }: NavBarProps) {
  const session = useSession();
  const current = (href: string) => (pathname === href ? ("page" as const) : undefined);

  return (
    <nav aria-label="Main" className="nav-bar">
      <ul className="nav-bar__list">
        {LINKS.map(({ href, label }) => (
          <li key={href}>
            <a href={href} aria-current={current(href)}>
              {label}
            </a>
          </li>
        ))}
        {session === "signed-out" ? (
          <li>
            <a href="/sign-in" aria-current={current("/sign-in")}>
              Sign in
            </a>
          </li>
        ) : null}
        {session === "signed-in" ? (
          <li>
            <SignOutButton />
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
