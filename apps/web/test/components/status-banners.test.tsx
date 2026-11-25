import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ErrorRegion } from "../../src/components/ErrorRegion";
import { StaleDataBanner } from "../../src/components/StaleDataBanner";
import { SystemWideBanner } from "../../src/components/SystemWideBanner";
import { useUtcDisplayMode } from "./fixtures";

const CAPTURED_AT = "2025-01-01T12:00:00.000Z";

useUtcDisplayMode();

describe("restyled status banners", () => {
  it("StaleDataBanner keeps its testid, classes and text", () => {
    const { getByTestId } = render(<StaleDataBanner capturedAt={CAPTURED_AT} />);
    const el = getByTestId("stale-data-banner");
    expect(el.className).toContain("banner");
    expect(el.textContent).toContain("Data may be out of date. Last updated");
    const time = el.querySelector("time");
    expect(time?.getAttribute("datetime")).toBe(CAPTURED_AT);
    expect(time?.textContent).toBe("Jan 1, 2025, 12:00 UTC");
    expect(el.querySelector("svg, img")).toBeNull();
  });

  it("SystemWideBanner keeps its testid, heading and explanation", () => {
    const { getByTestId } = render(<SystemWideBanner explanation="Three ARTCCs affected." />);
    const el = getByTestId("system-wide-banner");
    expect(el.className).toContain("banner");
    expect(el.querySelector("h2")?.textContent).toBe("System-wide disruption");
    expect(el.textContent).toBe("System-wide disruptionThree ARTCCs affected.");
    expect(el.querySelector("svg, img")).toBeNull();
  });

  it("ErrorRegion alert text is exactly the message, and empty when none", () => {
    const { container, rerender } = render(<ErrorRegion message={null} />);
    const alert = container.querySelector("[role='alert']") as HTMLElement;
    expect(alert.textContent).toBe("");
    expect(alert.querySelector(".error-region__text")).toBeNull();
    rerender(<ErrorRegion message="Something broke." />);
    expect(container.querySelector("[role='alert']")).toBe(alert);
    expect(alert.textContent).toBe("Something broke.");
    expect(alert.querySelector("svg, img")).toBeNull();
  });
});
