import { describe, expect, it } from "vitest";
import { TechnicalMemoSectionCategory, TechnicalMemoSectionStatus } from "./enums";
import { TechnicalMemoSection } from "./technical-memo-section.entity";

const OCCURRED_AT = new Date("2026-01-01T00:00:00Z");

function baseSection() {
  return TechnicalMemoSection.create({
    id: "section-1",
    organizationId: "org-1",
    technicalMemoId: "memo-1",
    sectionKey: "0-methodologie",
    title: "Méthodologie",
    order: 0,
    level: 1,
    createdBy: "user-1",
    occurredAt: OCCURRED_AT,
  });
}

describe("TechnicalMemoSection", () => {
  it("démarre EMPTY, catégorie NEEDS_MAPPING, non confirmée (mission §14)", () => {
    const section = baseSection();
    expect(section.status).toBe(TechnicalMemoSectionStatus.Empty);
    expect(section.category).toBe(TechnicalMemoSectionCategory.NeedsMapping);
    expect(section.categoryConfirmedByUser).toBe(false);
  });

  it("BLOQUANT — suggestCategory est un no-op une fois categoryConfirmedByUser=true (mission §15)", () => {
    const section = baseSection();
    section.confirmCategory({ category: TechnicalMemoSectionCategory.Methodology, occurredAt: OCCURRED_AT });
    section.suggestCategory({ category: TechnicalMemoSectionCategory.References, occurredAt: OCCURRED_AT });
    expect(section.category).toBe(TechnicalMemoSectionCategory.Methodology);
    expect(section.categoryConfirmedByUser).toBe(true);
  });

  it("suggestCategory s'applique tant que non confirmée", () => {
    const section = baseSection();
    section.suggestCategory({ category: TechnicalMemoSectionCategory.Methodology, occurredAt: OCCURRED_AT });
    expect(section.category).toBe(TechnicalMemoSectionCategory.Methodology);
    expect(section.categoryConfirmedByUser).toBe(false);
  });

  it("applyRevision passe à NEEDS_REVIEW si des données manquent (mission §36)", () => {
    const section = baseSection();
    section.applyRevision({ content: "Texte généré avec [Information manquante]", hasMissingData: true, occurredAt: OCCURRED_AT });
    expect(section.status).toBe(TechnicalMemoSectionStatus.NeedsReview);
    expect(section.content).toContain("Information manquante");
  });

  it("applyRevision passe à DRAFT si aucune donnée ne manque", () => {
    const section = baseSection();
    section.applyRevision({ content: "Texte complet.", hasMissingData: false, occurredAt: OCCURRED_AT });
    expect(section.status).toBe(TechnicalMemoSectionStatus.Draft);
  });

  it("BLOQUANT — validate exige une action explicite, jamais automatique après génération (mission §38)", () => {
    const section = baseSection();
    section.applyRevision({ content: "Texte complet.", hasMissingData: false, occurredAt: OCCURRED_AT });
    expect(section.status).toBe(TechnicalMemoSectionStatus.Draft);
    section.validate(OCCURRED_AT);
    expect(section.status).toBe(TechnicalMemoSectionStatus.Validated);
  });

  it("markGenerating puis markFailed reflètent l'échec d'une génération", () => {
    const section = baseSection();
    section.markGenerating(OCCURRED_AT);
    expect(section.status).toBe(TechnicalMemoSectionStatus.Generating);
    section.markFailed(OCCURRED_AT);
    expect(section.status).toBe(TechnicalMemoSectionStatus.Failed);
  });
});
