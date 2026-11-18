import { PageHeader } from "../components/PageHeader";

export function NotFoundPage() {
  return (
    <section aria-labelledby="not-found-heading">
      <PageHeader titleId="not-found-heading" title="Page not found" />
      <p>There is no page at this address.</p>
      <p>
        <a href="/">Go to national status</a>
      </p>
    </section>
  );
}
