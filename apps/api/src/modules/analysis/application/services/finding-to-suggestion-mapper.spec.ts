import { describe, expect, it } from "vitest";
import { AiSuggestionEntityType } from "../../../ai-suggestion";
import { CREATE_FIELD_SENTINEL } from "../../../ai-suggestion-bridge";
import { DeadlineKind } from "../../domain/business/deadline-kind";
import type { CriterionFindingRecord, DeadlineFindingRecord, RequirementFindingRecord, RiskFindingRecord } from "../ports/business-analysis.repository";
import { mapCriterionFinding, mapDeadlineFinding, mapRequirementFinding, mapRiskFinding } from "./finding-to-suggestion-mapper";

function baseDeadline(overrides: Partial<DeadlineFindingRecord> = {}): DeadlineFindingRecord {
  return {
    id: "deadline-1",
    kind: DeadlineKind.Submission,
    label: "Remise des offres",
    date: "2026-09-01T12:00:00.000Z",
    isInferred: false,
    confidence: 0.9,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseCriterion(overrides: Partial<CriterionFindingRecord> = {}): CriterionFindingRecord {
  return {
    id: "criterion-1",
    name: "Prix",
    weight: 40,
    isEliminatory: false,
    isInferred: false,
    confidence: 0.85,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseRequirement(overrides: Partial<RequirementFindingRecord> = {}): RequirementFindingRecord {
  return {
    id: "requirement-1",
    category: "ADMINISTRATIVE",
    label: "Attestation d'assurance",
    isMandatory: true,
    isInferred: false,
    confidence: 0.75,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseRisk(overrides: Partial<RiskFindingRecord> = {}): RiskFindingRecord {
  return {
    id: "risk-1",
    title: "Délai de remise très court",
    category: "PLANNING",
    severity: "HIGH",
    explanation: "Le délai laissé pour répondre est inférieur à 15 jours.",
    recommendation: "Prioriser la constitution du dossier administratif dès réception.",
    isInferred: true,
    confidence: 0.6,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("mapDeadlineFinding", () => {
  it("maps a SUBMISSION deadline to a single TENDER_FIELD.submissionDeadline update", () => {
    const mapped = mapDeadlineFinding(baseDeadline({ kind: DeadlineKind.Submission }));
    expect(mapped).toHaveLength(1);
    expect(mapped[0]).toMatchObject({
      entityType: AiSuggestionEntityType.TenderField,
      fieldName: "submissionDeadline",
      proposedValue: "2026-09-01T12:00:00.000Z",
    });
    expect(mapped[0]?.entityId).toBeUndefined();
  });

  it("maps QUESTIONS/PUBLICATION/START_ESTIMATED to a single Tender field update", () => {
    expect(mapDeadlineFinding(baseDeadline({ kind: DeadlineKind.Questions }))[0]?.fieldName).toBe("questionsDeadline");
    expect(mapDeadlineFinding(baseDeadline({ kind: DeadlineKind.Publication }))[0]?.fieldName).toBe("publicationDate");
    expect(mapDeadlineFinding(baseDeadline({ kind: DeadlineKind.StartEstimated }))[0]?.fieldName).toBe("estimatedStartDate");
  });

  it("maps any other deadline kind to a single TENDER_MILESTONE creation proposal", () => {
    const mapped = mapDeadlineFinding(baseDeadline({ kind: DeadlineKind.Contractual, label: "Notification du marché", rawText: "sous 30 jours" }));
    expect(mapped).toHaveLength(1);
    expect(mapped[0]).toMatchObject({
      entityType: AiSuggestionEntityType.TenderMilestone,
      fieldName: CREATE_FIELD_SENTINEL,
      proposedValue: { title: "Notification du marché", date: "2026-09-01T12:00:00.000Z", type: "CUSTOM", description: "sous 30 jours" },
    });
  });

  it("returns an empty array when no normalized date is available (rawText only)", () => {
    expect(mapDeadlineFinding(baseDeadline({ date: undefined, rawText: "à réception du dossier" }))).toEqual([]);
  });

  /** V2 Sprint 6 §9 — seule nature d'échéance qui produit une SECONDE suggestion CHECKLIST_ITEM,
   *  en plus (jamais à la place) de la suggestion TENDER_FIELD existante. */
  it("VISIT additionally maps to a CHECKLIST_ITEM(VISIT) suggestion, alongside the existing TENDER_FIELD.visitDate suggestion", () => {
    const mapped = mapDeadlineFinding(baseDeadline({ kind: DeadlineKind.Visit, label: "Visite obligatoire du site" }));

    expect(mapped).toHaveLength(2);
    expect(mapped[0]).toMatchObject({ entityType: AiSuggestionEntityType.TenderField, fieldName: "visitDate" });
    expect(mapped[1]).toMatchObject({
      entityType: AiSuggestionEntityType.ChecklistItem,
      fieldName: CREATE_FIELD_SENTINEL,
      proposedValue: { title: "Visite obligatoire du site", type: "VISIT", requirementLevel: "MANDATORY", dueDate: "2026-09-01T12:00:00.000Z" },
    });
  });

  it("a non-VISIT deadline never produces a CHECKLIST_ITEM suggestion", () => {
    const mapped = mapDeadlineFinding(baseDeadline({ kind: DeadlineKind.Submission }));
    expect(mapped.some((suggestion) => suggestion.entityType === AiSuggestionEntityType.ChecklistItem)).toBe(false);
  });
});

describe("mapCriterionFinding", () => {
  it("maps a non-eliminatory criterion to a single TENDER_AWARD_CRITERION creation proposal with a stringified weight", () => {
    const mapped = mapCriterionFinding(baseCriterion({ weight: 40, isEliminatory: false }));
    expect(mapped).toHaveLength(1);
    expect(mapped[0]).toMatchObject({
      entityType: AiSuggestionEntityType.TenderAwardCriterion,
      fieldName: CREATE_FIELD_SENTINEL,
      proposedValue: { name: "Prix", weight: "40" },
    });
  });

  it("carries eliminationThreshold only when isEliminatory is true and a threshold is present", () => {
    const eliminatory = mapCriterionFinding(baseCriterion({ isEliminatory: true, threshold: "10/20" }));
    expect(eliminatory[0]?.proposedValue).toMatchObject({ eliminationThreshold: "10/20" });

    const nonEliminatory = mapCriterionFinding(baseCriterion({ isEliminatory: false, threshold: "10/20" }));
    expect(nonEliminatory[0]?.proposedValue).not.toHaveProperty("eliminationThreshold");
  });

  it("returns an empty array when no weight was extracted", () => {
    expect(mapCriterionFinding(baseCriterion({ weight: undefined }))).toEqual([]);
    expect(mapCriterionFinding(baseCriterion({ weight: null }))).toEqual([]);
  });

  /** V2 Sprint 6 §9 — un critère éliminatoire produit une SECONDE suggestion CHECKLIST_ITEM
   *  (preuve/seuil à préparer), en plus de la suggestion TENDER_AWARD_CRITERION existante. */
  it("an eliminatory criterion additionally maps to a CHECKLIST_ITEM(TECHNICAL_REQUIREMENT, BLOCKING) suggestion", () => {
    const mapped = mapCriterionFinding(baseCriterion({ isEliminatory: true, threshold: "10/20", weight: 20 }));

    expect(mapped).toHaveLength(2);
    expect(mapped[0]?.entityType).toBe(AiSuggestionEntityType.TenderAwardCriterion);
    expect(mapped[1]).toMatchObject({
      entityType: AiSuggestionEntityType.ChecklistItem,
      fieldName: CREATE_FIELD_SENTINEL,
      proposedValue: { title: "Prix", type: "TECHNICAL_REQUIREMENT", requirementLevel: "MANDATORY", criticality: "BLOCKING" },
    });
  });

  it("a non-eliminatory criterion never produces a CHECKLIST_ITEM suggestion", () => {
    const mapped = mapCriterionFinding(baseCriterion({ isEliminatory: false, weight: 20 }));
    expect(mapped.some((suggestion) => suggestion.entityType === AiSuggestionEntityType.ChecklistItem)).toBe(false);
  });
});

/** V2 Sprint 6 §9-10 — redirection : RequirementFinding cible désormais EXCLUSIVEMENT
 *  CHECKLIST_ITEM, plus jamais TENDER_REQUESTED_DOCUMENT (audit Codex, décision produit confirmée
 *  — voir le commentaire de `mapRequirementFinding`). */
describe("mapRequirementFinding", () => {
  it("always maps to exactly one CHECKLIST_ITEM creation proposal, never TENDER_REQUESTED_DOCUMENT", () => {
    const mapped = mapRequirementFinding(baseRequirement({ expectedFormat: "PDF signé" }));

    expect(mapped).toHaveLength(1);
    expect(mapped[0]).toMatchObject({
      entityType: AiSuggestionEntityType.ChecklistItem,
      fieldName: CREATE_FIELD_SENTINEL,
      proposedValue: { title: "Attestation d'assurance", type: "ADMINISTRATIVE_DOCUMENT", requirementLevel: "MANDATORY", description: "PDF signé" },
    });
    expect(mapped[0]?.entityType).not.toBe(AiSuggestionEntityType.TenderRequestedDocument);
  });

  it("maps isMandatory=false to requirementLevel=CONDITIONAL", () => {
    const mapped = mapRequirementFinding(baseRequirement({ isMandatory: false }));
    expect(mapped[0]?.proposedValue).toMatchObject({ requirementLevel: "CONDITIONAL" });
  });

  it("maps each governed RequirementCategory to its corresponding ChecklistItemType, never an invalid value", () => {
    expect(mapRequirementFinding(baseRequirement({ category: "CERTIFICATION" }))[0]?.proposedValue).toMatchObject({ type: "CERTIFICATION" });
    expect(mapRequirementFinding(baseRequirement({ category: "INSURANCE" }))[0]?.proposedValue).toMatchObject({ type: "INSURANCE" });
    expect(mapRequirementFinding(baseRequirement({ category: "SIGNATURE" }))[0]?.proposedValue).toMatchObject({ type: "SIGNATURE" });
    expect(mapRequirementFinding(baseRequirement({ category: "OTHER" }))[0]?.proposedValue).toMatchObject({ type: "OTHER" });
  });
});

describe("mapRiskFinding", () => {
  it("always maps to exactly one TENDER_RISK creation proposal, normalizing a matching category", () => {
    const mapped = mapRiskFinding(baseRisk({ category: "planning" }));
    expect(mapped).toHaveLength(1);
    expect(mapped[0]).toMatchObject({
      entityType: AiSuggestionEntityType.TenderRisk,
      fieldName: CREATE_FIELD_SENTINEL,
      proposedValue: {
        title: "Délai de remise très court",
        severity: "HIGH",
        description: "Le délai laissé pour répondre est inférieur à 15 jours.",
        mitigation: "Prioriser la constitution du dossier administratif dès réception.",
        category: "PLANNING",
      },
    });
  });

  it("omits category when it does not match the closed Tenders RiskCategory catalogue", () => {
    const mapped = mapRiskFinding(baseRisk({ category: "unexpected-ai-category" }));
    expect(mapped[0]?.proposedValue).not.toHaveProperty("category");
  });

  /** V2 Sprint 6 §9 — mission explicite : "ne devient pas automatiquement ChecklistItem". */
  it("never produces a CHECKLIST_ITEM suggestion, regardless of severity", () => {
    const mapped = mapRiskFinding(baseRisk({ severity: "CRITICAL" }));
    expect(mapped.some((suggestion) => suggestion.entityType === AiSuggestionEntityType.ChecklistItem)).toBe(false);
  });
});
