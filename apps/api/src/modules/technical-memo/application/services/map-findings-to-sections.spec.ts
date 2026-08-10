import { describe, expect, it } from "vitest";
import { TechnicalMemoRequirementFindingType, TechnicalMemoSectionCategory } from "../../domain/enums";
import { TechnicalMemoSection } from "../../domain/technical-memo-section.entity";
import { mapFindingsToSections } from "./map-findings-to-sections";

const OCCURRED_AT = new Date("2026-01-01T00:00:00Z");

function fakeIdGenerator() {
  let counter = 0;
  return { generate: () => `link-${++counter}` };
}

function section(overrides: Partial<Parameters<typeof TechnicalMemoSection.create>[0]> & { category: TechnicalMemoSectionCategory }) {
  const created = TechnicalMemoSection.create({
    id: overrides.id ?? "section-1",
    organizationId: "org-1",
    technicalMemoId: "memo-1",
    sectionKey: overrides.sectionKey ?? "0-section",
    title: overrides.title ?? "Section",
    order: overrides.order ?? 0,
    level: 1,
    createdBy: "user-1",
    occurredAt: OCCURRED_AT,
  });
  created.confirmCategory({ category: overrides.category, occurredAt: OCCURRED_AT });
  return created;
}

describe("mapFindingsToSections", () => {
  it("relie une exigence à la section dont la catégorie correspond au texte de l'exigence", () => {
    const securitySection = section({ id: "sec-security", category: TechnicalMemoSectionCategory.Security, title: "9. Sécurité" });
    const links = mapFindingsToSections({
      sections: [securitySection],
      corpus: {
        requirements: [{ id: "req-1", category: "TECHNICAL", label: "Le candidat doit décrire son plan de sécurité", isMandatory: true, isInferred: false, confidence: 0.9, createdAt: OCCURRED_AT.toISOString() }],
        criteria: [],
        clauses: [],
      },
      organizationId: "org-1",
      idGenerator: fakeIdGenerator(),
      occurredAt: OCCURRED_AT,
    });

    expect(links).toHaveLength(1);
    expect(links[0]!.technicalMemoSectionId).toBe("sec-security");
    expect(links[0]!.findingType).toBe(TechnicalMemoRequirementFindingType.Requirement);
    expect(links[0]!.findingId).toBe("req-1");
  });

  it("BLOQUANT — ne relie rien si aucune section ne partage la catégorie déduite (jamais un lien forcé)", () => {
    const methodologySection = section({ id: "sec-methodology", category: TechnicalMemoSectionCategory.Methodology });
    const links = mapFindingsToSections({
      sections: [methodologySection],
      corpus: {
        requirements: [{ id: "req-1", category: "OTHER", label: "Fournir une attestation d'assurance décennale", isMandatory: true, isInferred: false, confidence: 0.9, createdAt: OCCURRED_AT.toISOString() }],
        criteria: [],
        clauses: [],
      },
      organizationId: "org-1",
      idGenerator: fakeIdGenerator(),
      occurredAt: OCCURRED_AT,
    });

    expect(links).toHaveLength(0);
  });

  it("relie un critère et une clause via leurs propres champs texte (name/summary)", () => {
    const planningSection = section({ id: "sec-planning", category: TechnicalMemoSectionCategory.Planning, title: "7. Planning" });
    const links = mapFindingsToSections({
      sections: [planningSection],
      corpus: {
        requirements: [],
        criteria: [{ id: "crit-1", name: "Respect du calendrier et des délais", isEliminatory: false, isInferred: false, confidence: 0.8, createdAt: OCCURRED_AT.toISOString() }],
        clauses: [{ id: "clause-1", category: "PLANNING", summary: "Le planning prévisionnel doit être remis avant le démarrage", isInferred: false, confidence: 0.7, createdAt: OCCURRED_AT.toISOString() }],
      },
      organizationId: "org-1",
      idGenerator: fakeIdGenerator(),
      occurredAt: OCCURRED_AT,
    });

    expect(links).toHaveLength(2);
    expect(links.map((l) => l.findingType).sort()).toEqual([TechnicalMemoRequirementFindingType.Clause, TechnicalMemoRequirementFindingType.Criterion].sort());
  });

  it("associe une exigence à PLUSIEURS sections si plusieurs partagent la même catégorie déduite", () => {
    const first = section({ id: "sec-1", category: TechnicalMemoSectionCategory.Quality, order: 0 });
    const second = section({ id: "sec-2", category: TechnicalMemoSectionCategory.Quality, order: 1 });
    const links = mapFindingsToSections({
      sections: [first, second],
      corpus: {
        requirements: [{ id: "req-1", category: "QUALITY", label: "Certification qualité ISO 9001 requise", isMandatory: false, isInferred: false, confidence: 0.6, createdAt: OCCURRED_AT.toISOString() }],
        criteria: [],
        clauses: [],
      },
      organizationId: "org-1",
      idGenerator: fakeIdGenerator(),
      occurredAt: OCCURRED_AT,
    });

    expect(links).toHaveLength(2);
    expect(links.map((l) => l.technicalMemoSectionId).sort()).toEqual(["sec-1", "sec-2"]);
  });
});
