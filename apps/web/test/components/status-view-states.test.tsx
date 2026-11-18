import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StatusView } from "../../src/components/StatusView";
import { StatusPage } from "../../src/pages/StatusPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("StatusView loading, empty and failure states", () => {
  it("shows LoadingState text with no stale banner, table or card", () => {
    const { container, getByText, queryByTestId } = render(
      <StatusView status={null} events={[]} loading />,
    );
    expect(getByText("Loading status…")).not.toBeNull();
    expect(container.querySelector(".loading-state")).not.toBeNull();
    expect(queryByTestId("stale-data-banner")).toBeNull();
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector(".summary-card")).toBeNull();
    const live = container.querySelectorAll("[aria-live]");
    expect(live).toHaveLength(1);
    expect(live[0]?.textContent).toBe("");
  });

  it("shows the no_data message in an EmptyState with no table or stale banner", () => {
    const message = "No data yet. The first FAA check has not completed.";
    const { container, getByText, queryByTestId } = render(
      <StatusView status={{ state: "no_data", message }} events={[]} loading={false} />,
    );
    expect(getByText(message).closest(".empty-state")).not.toBeNull();
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector(".summary-card")).toBeNull();
    expect(queryByTestId("stale-data-banner")).toBeNull();
    expect(container.querySelector("[aria-live]")?.textContent).toBe("");
  });

  it("is not blank after a first-load failure and keeps the alert text exact", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 500 })));
    const { container, findByText } = render(<StatusPage />);
    await findByText("Could not load the status. Retrying automatically.");
    expect(container.querySelector("[role='alert']")?.textContent).toBe(
      "Could not load the status. Retrying automatically.",
    );
    expect(container.querySelector(".status-view .empty-state")?.textContent).toContain(
      "No status to show yet.",
    );
  });
});
