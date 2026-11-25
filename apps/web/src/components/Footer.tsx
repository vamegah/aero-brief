export const FAA_STATUS_URL = "https://nasstatus.faa.gov/";
export const API_DOCS_URL = "https://github.com/vamegah/aero-brief/blob/main/docs/api.md";
export const LICENSE_URL = "https://github.com/vamegah/aero-brief/blob/main/LICENSE";
export const ADVISORY_NOTICE = "Information is advisory and not for operational flight decisions.";

interface ExternalLinkProps {
  href: string;
  children: string;
}

/** Opens in a new tab; the hidden hint tells screen reader users so. */
function ExternalLink({ href, children }: ExternalLinkProps) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}

/** Footer (ui-improvements Requirement 14). Rendered by App after <main>. Terms and Privacy are deferred. */
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <p className="site-footer__item site-footer__item--primary">
          <ExternalLink href={API_DOCS_URL}>API documentation</ExternalLink>
        </p>
        <p className="site-footer__item site-footer__item--primary">
          Data source: <ExternalLink href={FAA_STATUS_URL}>FAA NAS Status</ExternalLink>
        </p>
        <p className="site-footer__item site-footer__notice">{ADVISORY_NOTICE}</p>
        <p className="site-footer__item site-footer__secondary">
          License: <ExternalLink href={LICENSE_URL}>MIT</ExternalLink>
          {" · "}Built with Kiro · Kiroween 2026
        </p>
      </div>
    </footer>
  );
}
