import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Optional id for the <h2>, so a parent section can reference it with aria-labelledby. */
  titleId?: string;
  /** One optional slot, for example a single button or a short indicator. */
  action?: ReactNode;
}

/** Page title as `<h2>`. `App.tsx` owns the only `<h1>`. */
export function PageHeader({ title, subtitle, titleId, action }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        <h2 id={titleId} className="page-header__title">{title}</h2>
        {subtitle !== undefined ? <p className="page-header__subtitle">{subtitle}</p> : null}
      </div>
      {action !== undefined && action !== null ? (
        <div className="page-header__action">{action}</div>
      ) : null}
    </header>
  );
}
