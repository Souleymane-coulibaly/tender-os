import { describe, expect, it } from "vitest";
import { isValidTagLabel, normalizeTagLabel } from "./tag-normalizer";

describe("normalizeTagLabel", () => {
  it("lowercases and trims", () => {
    expect(normalizeTagLabel("  ISO-27001  ")).toBe("iso-27001");
  });

  it("never conflates a hyphenated tag with its spaced variant (deliberately no such equivalence)", () => {
    expect(normalizeTagLabel("secteur-public")).toBe("secteur-public");
    expect(normalizeTagLabel("secteur public")).toBe("secteur public");
    expect(normalizeTagLabel("secteur-public")).not.toBe(normalizeTagLabel("secteur public"));
  });

  it("collapses internal whitespace runs to a single space", () => {
    expect(normalizeTagLabel("cyber   sécurité")).toBe("cyber sécurité");
  });

  it("treats different casings of the same label as identical (mission: no case-based duplicates)", () => {
    expect(normalizeTagLabel("Cloud")).toBe(normalizeTagLabel("CLOUD"));
    expect(normalizeTagLabel("Cloud")).toBe(normalizeTagLabel("cloud"));
  });
});

describe("isValidTagLabel", () => {
  it("rejects an empty or whitespace-only label", () => {
    expect(isValidTagLabel("   ")).toBe(false);
  });

  it("rejects a label over 60 characters", () => {
    expect(isValidTagLabel("a".repeat(61))).toBe(false);
  });

  it("accepts a normal label", () => {
    expect(isValidTagLabel("cybersécurité")).toBe(true);
  });
});
