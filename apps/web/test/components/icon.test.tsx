import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon, ICON_NAMES } from "../../src/components/Icon";

describe("Icon", () => {
  it("renders an empty aria-hidden span with a mask class and no svg or img", () => {
    const { container } = render(<Icon name="alert" />);
    const span = container.firstElementChild as HTMLElement;
    expect(span.tagName).toBe("SPAN");
    expect(span.getAttribute("aria-hidden")).toBe("true");
    expect(span.className).toBe("icon icon--alert");
    expect(span.textContent).toBe("");
    expect(container.querySelector("svg, img")).toBeNull();
  });

  it("never uses a class name containing 'map'", () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />);
      expect((container.firstElementChild as HTMLElement).className.toLowerCase()).not.toContain("map");
      unmount();
    }
  });
});
