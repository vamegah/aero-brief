export const FAA_STATUS_URL = "https://nasstatus.faa.gov";
export const LICENSE_URL = "https://github.com/vamegah/aero-brief/blob/main/LICENSE";

/** Attribution footer (Requirement 15.3). Rendered by App after <main>. */
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <p className="site-footer__item">
          Data source: <a href={FAA_STATUS_URL}>FAA NAS Status API</a>
        </p>
        <p className="site-footer__item">
          License: <a href={LICENSE_URL}>MIT</a>
        </p>
        <p className="site-footer__item">Built with Kiro · Kiroween 2026</p>
      </div>
    </footer>
  );
}
