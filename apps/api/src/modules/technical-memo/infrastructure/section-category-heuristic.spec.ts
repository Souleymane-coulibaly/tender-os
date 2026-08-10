import { describe, expect, it } from "vitest";
import { TechnicalMemoSectionCategory } from "../domain/enums";
import { suggestSectionCategory } from "./section-category-heuristic";

describe("suggestSectionCategory", () => {
  it("reconnaît les titres avec accents et casse variable", () => {
    expect(suggestSectionCategory("1. Présentation de l'entreprise")).toBe(TechnicalMemoSectionCategory.CompanyPresentation);
    expect(suggestSectionCategory("MÉTHODOLOGIE")).toBe(TechnicalMemoSectionCategory.Methodology);
    expect(suggestSectionCategory("2.1 Contexte")).toBe(TechnicalMemoSectionCategory.Understanding);
  });

  it("reconnaît moyens humains vs moyens techniques distinctement", () => {
    expect(suggestSectionCategory("4. Moyens humains")).toBe(TechnicalMemoSectionCategory.HumanResources);
    expect(suggestSectionCategory("6. Moyens techniques")).toBe(TechnicalMemoSectionCategory.TechnicalResources);
  });

  it("BLOQUANT — retombe sur NEEDS_MAPPING pour un titre non reconnu, jamais une catégorie inventée (mission §14)", () => {
    expect(suggestSectionCategory("Annexe Z — divers")).toBe(TechnicalMemoSectionCategory.NeedsMapping);
  });
});
