import { describe, expect, it } from "vitest";
import { countMatchedIncludeKeywords, keywordFilterPasses, normalizeSearchableText, textContainsKeyword } from "./keyword-matching";

describe("keyword-matching", () => {
  it("normalizes case and accents", () => {
    expect(normalizeSearchableText("Île-de-France")).toBe("ile-de-france");
    expect(normalizeSearchableText("NETTOYAGE Industriel")).toBe("nettoyage industriel");
  });

  it("textContainsKeyword is case/accent-insensitive", () => {
    expect(textContainsKeyword("Marché de nettoyage à Paris", "NETTOYAGE")).toBe(true);
    expect(textContainsKeyword("Marché de nettoyage à Paris", "cybersécurité")).toBe(false);
  });

  it("BLOQUANT — includeKeywords: at least one must match (HARD filter)", () => {
    expect(keywordFilterPasses("Marché de cybersécurité", ["cybersécurité", "cloud"], [])).toBe(true);
    expect(keywordFilterPasses("Marché de nettoyage", ["cybersécurité", "cloud"], [])).toBe(false);
  });

  it("BLOQUANT — excludeKeywords: a single match excludes (HARD filter), regardless of include matches", () => {
    expect(keywordFilterPasses("Marché de nettoyage industriel dangereux", ["nettoyage"], ["dangereux"])).toBe(false);
  });

  it("no includeKeywords means no keyword restriction on inclusion", () => {
    expect(keywordFilterPasses("N'importe quoi", [], [])).toBe(true);
  });

  it("countMatchedIncludeKeywords counts partial matches for scoring", () => {
    expect(countMatchedIncludeKeywords("Marché de nettoyage industriel", ["nettoyage", "cloud", "industriel"])).toBe(2);
  });
});
