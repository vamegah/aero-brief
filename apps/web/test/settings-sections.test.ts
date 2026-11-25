import { describe, expect, it } from "vitest";
import { ALL_FLAGS_OFF, type Features } from "../src/features/features-schema";
import { SECTION_IDS, SECTION_LABELS, resolveSection, visibleSections } from "../src/lib/settings-sections";

const off = ALL_FLAGS_OFF;
const flags = (over: Partial<Features>): Features => ({ ...off, ...over });

describe("visibleSections", () => {
  it("shows display and account with every flag off", () => {
    expect(visibleSections(off)).toEqual(["display", "account"]);
  });

  it("shows display for darkMode alone", () => {
    expect(visibleSections(flags({ darkMode: true }))).toEqual(["display", "account"]);
  });

  it("shows display for highContrast alone", () => {
    expect(visibleSections(flags({ highContrast: true }))).toEqual(["display", "account"]);
  });

  it("shows digest for digests alone", () => {
    expect(visibleSections(flags({ digests: true }))).toEqual(["digest", "display", "account"]);
  });

  it("shows webhooks for webhooks alone", () => {
    expect(visibleSections(flags({ webhooks: true }))).toEqual(["webhooks", "display", "account"]);
  });

  it("shows all four in fixed order with every flag on", () => {
    const all = flags({ darkMode: true, highContrast: true, digests: true, webhooks: true });
    expect(visibleSections(all)).toEqual([...SECTION_IDS]);
  });
});

describe("resolveSection", () => {
  const all = [...SECTION_IDS];

  it("orders sections Daily digest, Webhooks, Display, Account", () => {
    expect([...SECTION_IDS]).toEqual(["digest", "webhooks", "display", "account"]);
  });

  it("falls back to the first visible section for an empty hash", () => {
    expect(resolveSection("", all)).toBe("digest");
    expect(resolveSection("", ["account"])).toBe("account");
  });

  it("falls back for a bare #", () => {
    expect(resolveSection("#", all)).toBe("digest");
  });

  it("falls back for an unknown hash", () => {
    expect(resolveSection("#nope", all)).toBe("digest");
  });

  it("defaults to webhooks when digests are off and webhooks are on", () => {
    expect(resolveSection("", visibleSections(flags({ webhooks: true })))).toBe("webhooks");
  });

  it("falls back to display when the webhooks flag is off", () => {
    expect(resolveSection("#webhooks", visibleSections(off))).toBe("display");
  });

  it("resolves a visible section with or without the #", () => {
    expect(resolveSection("#webhooks", all)).toBe("webhooks");
    expect(resolveSection("digest", all)).toBe("digest");
  });

  it("returns account when nothing is visible", () => {
    expect(resolveSection("#display", [])).toBe("account");
  });
});

describe("SECTION_LABELS", () => {
  it("labels every section", () => {
    expect(SECTION_LABELS).toEqual({
      display: "Display",
      digest: "Daily digest",
      webhooks: "Webhooks",
      account: "Account",
    });
  });
});
