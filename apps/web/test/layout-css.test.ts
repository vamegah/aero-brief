/**
 * CSS regression test for the ui-refresh layout rules (task 8.2).
 * jsdom cannot compute layout, so this reads the stylesheet text and pins the rules that
 * stop words breaking mid-word, pills and buttons wrapping, and the page scrolling sideways.
 * Requirements: 7.2, 8.1, 8.2, 8.3, 9.1, 10.1, 10.2, 10.3, 12.3, 16.5.
 */
import { describe, expect, it } from "vitest";
import appCss from "../src/styles/app.css?raw";
import controlsCss from "../src/styles/controls.css?raw";
import indexCss from "../src/index.css?raw";
import primitivesCss from "../src/styles/primitives.css?raw";
import settingsCss from "../src/styles/settings.css?raw";
import shellCss from "../src/styles/shell.css?raw";
import surfacesCss from "../src/styles/surfaces.css?raw";
import tablesCss from "../src/styles/tables.css?raw";
import { declared, findRules, parseCss, stripComments, type CssRule } from "./helpers/css";

const NARROW = "(max-width: 640px)";
const WIDE = "(min-width: 641px)";

/** The five stylesheets added by the refresh. */
const refresh: Record<string, string> = {
  "shell.css": shellCss,
  "tables.css": tablesCss,
  "controls.css": controlsCss,
  "settings.css": settingsCss,
  "surfaces.css": surfacesCss,
};
/** Every app stylesheet this test covers. */
const all: Record<string, string> = {
  ...refresh,
  "index.css": indexCss,
  "primitives.css": primitivesCss,
  "app.css": appCss,
};

const rulesOf = (css: string): CssRule[] => parseCss(css);
const tables = rulesOf(tablesCss);
const controls = rulesOf(controlsCss);
const settings = rulesOf(settingsCss);

describe("layout css: the helper reads the files", () => {
  it("gets real CSS text, not a blanked module", () => {
    for (const [name, css] of Object.entries(all)) {
      expect(css.length, name).toBeGreaterThan(100);
      expect(rulesOf(css).length, name).toBeGreaterThan(0);
    }
  });
});

describe("layout css: words never break mid-word by default", () => {
  it("uses no overflow-wrap: anywhere or word-break: break-all in any app stylesheet", () => {
    for (const [name, css] of Object.entries(all)) {
      const code = stripComments(css);
      expect(code, name).not.toMatch(/overflow-wrap\s*:\s*anywhere/i);
      expect(code, name).not.toMatch(/word-break\s*:\s*break-all/i);
    }
  });

  it("sets overflow-wrap: normal on table cells", () => {
    expect(declared(tables, ".airport-table td", "overflow-wrap")).toBe("normal");
  });

  it("allows break-word only on the airport name cell and the detail text", () => {
    const breakers = tables
      .filter((r) => r.decls.get("overflow-wrap") === "break-word")
      .flatMap((r) => r.selectors);
    expect(breakers.sort()).toEqual([".airport-table__detail", ".airport-table tbody td.airport-table__name"].sort());
  });
});

describe("layout css: buttons, pills and header cells do not wrap", () => {
  it("table header cells use white-space: nowrap", () => {
    expect(declared(tables, ".airport-table thead th", "white-space", null)).toBe("nowrap");
  });

  it(".btn uses white-space: nowrap", () => {
    expect(declared(controls, ".btn", "white-space")).toBe("nowrap");
  });

  it(".status-pill uses white-space: nowrap and flex: none", () => {
    expect(declared(controls, ".status-pill", "white-space")).toBe("nowrap");
    expect(declared(controls, ".status-pill", "flex")).toBe("none");
  });

  it("row buttons in airport tables have min-width: 5.5rem", () => {
    expect(declared(controls, ".airport-table .btn", "min-width")).toBe("5.5rem");
  });

  it("the Status and Watchlist action cells do not wrap", () => {
    expect(declared(tables, ".airport-table--watchlist tbody td", "white-space", null)).toBe("nowrap");
    expect(declared(tables, ".airport-table--status tbody td:last-child", "white-space", null)).toBe("nowrap");
  });
});

describe("layout css: stacked table layout at 640px and below", () => {
  it("has a max-width: 640px block with grid rows", () => {
    expect(findRules(tables, ".airport-table tbody tr", NARROW).length).toBeGreaterThan(0);
    expect(declared(tables, ".airport-table tbody tr", "display", NARROW)).toBe("grid");
  });

  it("stacks both table variants as grids", () => {
    expect(declared(tables, ".airport-table--status tbody tr", "grid-template-columns", NARROW)).toBeDefined();
    expect(declared(tables, ".airport-table--watchlist tbody tr", "grid-template-columns", NARROW)).toBeDefined();
  });

  it("makes the table and its cells block-level", () => {
    expect(declared(tables, ".airport-table", "display", NARROW)).toBe("block");
    expect(declared(tables, ".airport-table td", "display", NARROW)).toBe("block");
  });

  it("clips the header row instead of removing it", () => {
    expect(declared(tables, ".airport-table thead", "position", NARROW)).toBe("absolute");
    expect(declared(tables, ".airport-table thead", "clip", NARROW)).toBeDefined();
    expect(declared(tables, ".airport-table thead", "width", NARROW)).toBe("1px");
    expect(declared(tables, ".airport-table thead", "display", NARROW)).not.toBe("none");
  });

  it("leaves the wide layout as a table", () => {
    expect(declared(tables, ".airport-table", "display", null)).toBeUndefined();
    expect(declared(tables, ".airport-table tbody tr", "display", null)).toBeUndefined();
  });
});

describe("layout css: 44px touch targets", () => {
  it.each([
    [".btn"],
    ["select"],
    [".text-input"],
    [".display-settings__option"],
    [".digest-settings__option"],
    [".settings-menu a"],
    [".nav-bar a"],
    [".nav-bar button"],
  ])("%s has min-height: 44px", (selector) => {
    expect(declared(controls, selector, "min-height", null)).toBe("44px");
  });

  it("settings options and the digest select keep 44px inside the pane", () => {
    expect(declared(settings, ".settings__pane .display-settings__option", "min-height")).toBe("44px");
    expect(declared(settings, ".settings__pane .digest-settings__option", "min-height")).toBe("44px");
    expect(declared(settings, ".settings__pane .digest-settings__select", "min-height")).toBe("44px");
    expect(declared(settings, ".settings-menu a", "min-height")).toBe("44px");
  });

  it("standalone links get 44px on narrow or coarse pointers", () => {
    const rules = controls.filter((r) => r.media === `${NARROW}, (pointer: coarse)`);
    const link = rules.find((r) => r.selectors.includes("a.standalone"));
    expect(link?.decls.get("min-height")).toBe("44px");
  });

  it("stacked row-name links keep a 44px target", () => {
    expect(declared(tables, ".airport-table tbody th a", "min-height", NARROW)).toBe("44px");
    expect(declared(tables, ".airport-table tbody th a", "min-width", NARROW)).toBe("44px");
  });
});

describe("layout css: Settings tab bar scrolls inside itself", () => {
  it("narrow list is a non-wrapping flex row with overflow-x: auto", () => {
    expect(declared(settings, ".settings-menu__list", "display", null)).toBe("flex");
    expect(declared(settings, ".settings-menu__list", "flex-wrap", null)).toBe("nowrap");
    expect(declared(settings, ".settings-menu__list", "overflow-x", null)).toBe("auto");
  });

  it("tabs keep their width and their text on one line", () => {
    expect(declared(settings, ".settings-menu__list li", "flex", null)).toBe("0 0 auto");
    expect(declared(settings, ".settings-menu a", "white-space", null)).toBe("nowrap");
  });

  it("the grid column and panes can shrink, so the page does not grow", () => {
    expect(declared(settings, ".settings", "grid-template-columns", null)).toBe("minmax(0, 1fr)");
    expect(declared(settings, ".settings__panes", "min-width", null)).toBe("0");
    expect(declared(settings, ".settings-menu", "min-width", null)).toBe("0");
  });

  it("wide layout switches to a column menu with no inner scroll", () => {
    expect(declared(settings, ".settings-menu__list", "flex-direction", WIDE)).toBe("column");
    expect(declared(settings, ".settings-menu__list", "overflow-x", WIDE)).toBe("visible");
  });

  it("hidden panes are display: none", () => {
    expect(declared(settings, ".settings__pane[hidden]", "display")).toBe("none");
  });

  it("no rule sets overflow-x: hidden on html, body or main", () => {
    for (const [name, css] of Object.entries(all)) {
      for (const rule of rulesOf(css)) {
        const hides = [rule.decls.get("overflow-x"), rule.decls.get("overflow")].some((v) =>
          v?.split(" ").includes("hidden"),
        );
        if (!hides) continue;
        const bad = rule.selectors.filter((s) => /^(html|body|main)(\s|$|[.:[#])/.test(s));
        expect(bad, `${name}: ${rule.selectors.join(", ")}`).toEqual([]);
      }
    }
  });
});

describe("layout css: motion and color", () => {
  it.each(Object.entries(all))("%s disables every transition under prefers-reduced-motion", (name, css) => {
    const rules = rulesOf(css);
    const animated = rules
      .filter((r) => r.media === null || !r.media.includes("prefers-reduced-motion"))
      .filter((r) => {
        const t = r.decls.get("transition");
        return t !== undefined && t !== "none";
      })
      .flatMap((r) => r.selectors);
    if (animated.length === 0) return;
    const reduced = rules.filter((r) => r.media === "(prefers-reduced-motion: reduce)");
    expect(reduced.length, `${name} has no reduced-motion block`).toBeGreaterThan(0);
    for (const selector of animated) {
      const off = reduced.some((r) => r.selectors.includes(selector) && r.decls.get("transition") === "none");
      expect(off, `${name}: ${selector} keeps its transition under reduced motion`).toBe(true);
    }
  });

  it.each(Object.entries(refresh))("%s uses no raw hex color", (name, css) => {
    expect(stripComments(css), name).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
