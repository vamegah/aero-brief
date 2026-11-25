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
import themesCss from "../src/styles/themes.css?raw";
import { declared, findRules, parseCss, stripComments, type CssRule } from "./helpers/css";

const NARROW = "(max-width: 640px)";
/** Narrow_Layout is below 768px (Requirement 13.3); the nav bar and the section menu share it. */
const WIDE = "(min-width: 768px)";

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
    [".section-menu a"],
    [".nav-bar a"],
    [".nav-bar button"],
  ])("%s has min-height: 44px", (selector) => {
    expect(declared(controls, selector, "min-height", null)).toBe("44px");
  });

  it("settings options and the digest select keep 44px inside the pane", () => {
    expect(declared(settings, ".settings__pane .display-settings__option", "min-height")).toBe("44px");
    expect(declared(settings, ".settings__pane .digest-settings__option", "min-height")).toBe("44px");
    expect(declared(settings, ".settings__pane .digest-settings__select", "min-height")).toBe("44px");
    expect(declared(settings, ".section-menu a", "min-height")).toBe("44px");
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
    expect(declared(settings, ".section-menu__list", "display", null)).toBe("flex");
    expect(declared(settings, ".section-menu__list", "flex-wrap", null)).toBe("nowrap");
    expect(declared(settings, ".section-menu__list", "overflow-x", null)).toBe("auto");
  });

  it("tabs keep their width and their text on one line", () => {
    expect(declared(settings, ".section-menu__list li", "flex", null)).toBe("0 0 auto");
    expect(declared(settings, ".section-menu a", "white-space", null)).toBe("nowrap");
  });

  it("the grid column and panes can shrink, so the page does not grow", () => {
    expect(declared(settings, ".settings", "grid-template-columns", null)).toBe("minmax(0, 1fr)");
    expect(declared(settings, ".settings__panes", "min-width", null)).toBe("0");
    expect(declared(settings, ".section-menu", "min-width", null)).toBe("0");
  });

  it("wide layout switches to a column menu with no inner scroll", () => {
    expect(declared(settings, ".section-menu__list", "flex-direction", WIDE)).toBe("column");
    expect(declared(settings, ".section-menu__list", "overflow-x", WIDE)).toBe("visible");
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

describe("layout css: nav bar collapse and 320px usability (Requirements 13.3, 13.4, 13.5)", () => {
  const shell = rulesOf(shellCss);

  it("collapses the list behind the Menu toggle below 768px and shows it at 768px and up", () => {
    expect(declared(shell, ".nav-bar .nav-bar__toggle", "display", null)).toBe("inline-flex");
    expect(declared(shell, ".nav-bar .nav-bar__list--collapsed", "display", null)).toBe("none");
    expect(declared(shell, ".nav-bar .nav-bar__toggle", "display", WIDE)).toBe("none");
    expect(declared(shell, ".nav-bar .nav-bar__list--collapsed", "display", WIDE)).toBe("flex");
  });

  it("stacks the narrow list in one column and lays it out as a row when wide", () => {
    expect(declared(shell, ".nav-bar .nav-bar__list", "flex-direction", null)).toBe("column");
    expect(declared(shell, ".nav-bar .nav-bar__list", "flex-direction", WIDE)).toBe("row");
  });

  it("the header switches to one row at the same 768px breakpoint as the Settings menu", () => {
    expect(declared(shell, ".site-header__inner", "flex-direction", WIDE)).toBe("row");
    expect(declared(settings, ".section-menu__list", "flex-direction", WIDE)).toBe("column");
  });

  it("the Settings menu stays a scrollable horizontal tab bar below 768px", () => {
    expect(declared(settings, ".section-menu__list", "flex-direction", null)).toBeUndefined();
    expect(declared(settings, ".section-menu__list", "overflow-x", null)).toBe("auto");
  });

  it("every nav control keeps a 44px Touch_Target, including the toggle and the account button", () => {
    // The toggle, account button and Sign out are all <button> inside .nav-bar; Sign in and
    // Settings are <a> inside it. Both selectors carry min-height: 44px.
    expect(declared(controls, ".nav-bar a", "min-height", null)).toBe("44px");
    expect(declared(controls, ".nav-bar button", "min-height", null)).toBe("44px");
    expect(declared(shell, ".nav-bar a.nav-bar__signin", "border", null)).toContain("2px solid");
    expect(declared(shell, ".nav-bar a.nav-bar__signin", "min-height", null)).toBeUndefined();
  });

  it("the narrow nav never needs horizontal page scroll: the account panel is in flow, the dropdown only when wide", () => {
    expect(declared(shell, ".account-menu__panel", "position", null)).toBeUndefined();
    expect(declared(shell, ".account-menu__panel", "position", WIDE)).toBe("absolute");
    expect(declared(shell, ".nav-bar", "align-self", null)).toBe("stretch");
  });

  it("nothing in the nav rules sets a fixed width or min-width wider than 320px", () => {
    const code = stripComments(shellCss);
    expect(code).not.toMatch(/(?<!max-)(?<!min-)width\s*:\s*\d{3,}px/);
    expect(declared(shell, ".account-menu__panel", "min-width", WIDE)).toBe("12rem");
  });

  it("the nav-bar rules use no raw color", () => {
    expect(stripComments(shellCss)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
  });
});

describe("layout css: Status dashboard", () => {
  const surfaces = rulesOf(surfacesCss);
  const themes = rulesOf(themesCss);

  it("shares the Settings grid rules with the Status layout", () => {
    expect(declared(settings, ".status-layout", "display", null)).toBe("grid");
    expect(declared(settings, ".status-layout", "grid-template-columns", null)).toBe("minmax(0, 1fr)");
    expect(declared(settings, ".status-layout__panes", "min-width", null)).toBe("0");
    expect(declared(settings, ".status-layout", "grid-template-columns", WIDE)).toBe("14rem minmax(0, 1fr)");
  });

  it("hides inactive panes", () => {
    expect(declared(settings, ".status-pane[hidden]", "display")).toBe("none");
  });

  it("panes are Cards with the raised surface and a rule", () => {
    expect(declared(surfaces, ".status-pane", "background", null)).toBe("var(--color-surface-raised)");
    expect(declared(surfaces, ".status-pane", "border", null)).toContain("var(--color-table-rule)");
    expect(declared(surfaces, ".status-pane", "min-width", null)).toBe("0");
  });

  it("filters sit side by side on wide screens and stack on phones", () => {
    expect(declared(surfaces, ".event-filters", "display", null)).toBe("flex");
    expect(declared(surfaces, ".event-filters", "flex-wrap", null)).toBe("wrap");
    expect(declared(surfaces, ".event-filters", "flex-direction", NARROW)).toBe("column");
    expect(declared(surfaces, ".event-filters__field", "width", NARROW)).toBe("100%");
    expect(declared(surfaces, ".event-filters__field", "min-width", null)).toBe("0");
  });

  it("selects keep 44px and fill the width at Narrow", () => {
    expect(declared(controls, "select", "min-height", null)).toBe("44px");
    expect(declared(controls, "select", "width", NARROW)).toBe("100%");
  });

  it("the data-as-of and event-count lines use muted text", () => {
    expect(declared(surfaces, ".data-as-of", "color", null)).toBe("var(--color-text-muted)");
    expect(declared(surfaces, ".event-count", "color", null)).toBe("var(--color-text-muted)");
  });

  it("high-contrast themes give the pane a 2px border", () => {
    expect(declared(themes, 'html[data-theme^="hc-"] .status-pane', "border-width", null)).toBe("2px");
  });

  it("the new dashboard rules use no raw color", () => {
    const code = stripComments(surfacesCss);
    const dashboard = code.slice(code.indexOf(".status-pane {"));
    expect(dashboard).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
  });
});

describe("layout css: footer and shared container (ui-improvements Requirements 14.4, 15.1, 15.2)", () => {
  const shell = rulesOf(shellCss);
  const app = rulesOf(appCss);

  it("header, main and footer share one max-width and gutter", () => {
    const rule = shell.find(
      (r) =>
        r.media === null &&
        r.selectors.includes(".site-header__inner") &&
        r.selectors.includes("main") &&
        r.selectors.includes(".site-footer__inner"),
    );
    expect(rule?.decls.get("max-width")).toBe("var(--layout-max)");
    expect(rule?.decls.get("padding-inline")).toBe("var(--gutter)");
    expect(rule?.decls.get("margin-inline")).toBe("auto");
  });

  it("the page header adds no horizontal offset, so title and subtitle sit on the container edge", () => {
    const code = stripComments(surfacesCss);
    const block = (selector: string) => code.slice(code.indexOf(`${selector} {`)).split("}")[0] ?? "";
    for (const selector of [".page-header", ".page-header__text", ".page-header__title", ".page-header__subtitle"]) {
      expect(block(selector), selector).not.toMatch(/(margin|padding)(-left|-inline)[^;]*:/);
    }
  });

  it("the app root is a flex column at least one viewport tall and main takes the slack", () => {
    expect(declared(shell, "#root", "display", null)).toBe("flex");
    expect(declared(shell, "#root", "flex-direction", null)).toBe("column");
    expect(declared(shell, "#root", "min-height", null)).toBe("100dvh");
    expect(stripComments(shellCss)).toContain("min-height: 100vh");
    expect(declared(shell, "main", "flex", null)).toBe("1 0 auto");
    expect(declared(shell, "main", "width", null)).toBe("100%");
  });

  it("footer links are underlined with a visible focus indicator", () => {
    expect(declared(app, ".site-footer a", "text-decoration", null)).toBe("underline");
    expect(declared(app, ".site-footer a:focus-visible", "outline", null)).toBe("var(--focus-outline)");
  });

  it("footer spacing uses the spacing scale and the secondary line is smaller", () => {
    expect(declared(app, ".site-footer__inner", "padding-block", null)).toBe("var(--space-5)");
    expect(declared(app, ".site-footer__inner", "gap", null)).toMatch(/^var\(--space-\d\)( var\(--space-\d\))?$/);
    expect(declared(app, ".site-footer__secondary", "font-size", null)).toBe("var(--text-xs)");
  });

  it("the footer rules use no raw color or pixel spacing", () => {
    const code = stripComments(appCss);
    const footer = code.slice(code.indexOf(".site-footer {"), code.indexOf(".nav-bar a:focus-visible"));
    expect(footer).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    expect(footer).not.toMatch(/(margin|padding|gap)[^;]*\d+px/);
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
