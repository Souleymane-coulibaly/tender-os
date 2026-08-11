import { describe, expect, it } from "vitest";
import { anyCpvMatches, cpvMatches, significantCpvPrefix } from "./cpv-matching";

describe("cpv-matching", () => {
  it("strips trailing zeros to compute the significant prefix", () => {
    expect(significantCpvPrefix("34000000")).toBe("34");
    expect(significantCpvPrefix("34300000")).toBe("343");
    expect(significantCpvPrefix("34300000-4")).toBe("343");
  });

  it("BLOQUANT — a broad SavedSearch CPV matches a more specific tender CPV (parent -> child)", () => {
    expect(cpvMatches("34000000", "34300000")).toBe(true);
  });

  it("BLOQUANT — a specific SavedSearch CPV does NOT match a broader/unspecified tender CPV (never assume specificity)", () => {
    expect(cpvMatches("34300000", "34000000")).toBe(false);
  });

  it("a different family never matches, even with a shared leading digit", () => {
    expect(cpvMatches("34000000", "45000000")).toBe(false);
  });

  it("exact codes match", () => {
    expect(cpvMatches("34300000", "34300000")).toBe(true);
  });

  it("anyCpvMatches: empty saved-search CPV list means no CPV restriction (always true)", () => {
    expect(anyCpvMatches([], ["34300000"])).toBe(true);
  });

  it("anyCpvMatches: at least one match among many is enough", () => {
    expect(anyCpvMatches(["90000000", "34000000"], ["34300000"])).toBe(true);
  });

  it("anyCpvMatches: no match anywhere returns false", () => {
    expect(anyCpvMatches(["90000000"], ["34300000"])).toBe(false);
  });
});
