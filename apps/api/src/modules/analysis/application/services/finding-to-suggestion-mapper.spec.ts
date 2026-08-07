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
  it("maps a SUBMISSION deadline to a TENDER_FIELD.submissionDeadline update", () => {
    const mapped = mapDeadlineFinding(baseDeadline({ kind: DeadlineKind.Submission }));
    expect(mapped).toMatchObject({
      entityType: AiSuggestionEntityType.TenderField,
      fieldName: "submissionDeadline",
      proposedValue: "2026-09-01T12:00:00.000Z",
    });
    expect(mapped?.entityId).toBeUndefined();
  });

  it("maps QUESTIONS/VISIT/PUBLICATION/START_ESTIMATED to their respective Tender fields", () => {
    expect(mapDeadlineFinding(baseDeadline({ kind: DeadlineKind.Questions }))?.fieldName).toBe("questionsDeadline");
    expect(mapDeadlineFinding(baseDeadline({ kind: DeadlineKind.Visit }))?.fieldName).toBe("visitDate");
    expect(mapDeadlineFinding(baseDeadline({ kind: DeadlineKind.Publication }))?.fieldName).toBe("publicationDate");
    expect(mapDeadlineFinding(baseDeadline({ kind: DeadlineKind.StartEstimated }))?.fieldName).toBe("estimatedStartDate");
  });

  it("maps any other deadline kind to a TENDER_MILESTONE creation proposal", () => {
    const mapped = mapDeadlineFinding(baseDeadline({ kind: DeadlineKind.Contractual, label: "Notification du marché", rawText: "sous 30 jours" }));
    expect(mapped).toMatchObject({
      entityType: AiSuggestionEntityType.TenderMilestone,
      fieldName: CREATE_FIELD_SENTINEL,
      proposedValue: { title: "Notification du marché", date: "2026-09-01T12:00:00.000Z", type: "CUSTOM", description: "sous 30 jours" },
    });
  });

  it("returns null when no normalized date is available (rawText only)", () => {
    expect(mapDeadlineFinding(baseDeadline({ date: undefined, rawText: "à réception du dossier" }))).toBeNull();
  });
});

describe("mapCriterionFinding", () => {
  it("maps a criterion to a TENDER_AWARD_CRITERION creation proposal with a stringified weight", () => {
    const mapped = mapCriterionFinding(baseCriterion({ weight: 40 }));
    expect(mapped).toMatchObject({
      entityType: AiSuggestionEntityType.TenderAwardCriterion,
      fieldName: CREATE_FIELD_SENTINEL,
      proposedValue: { name: "Prix", weight: "40" },
    });
  });

  it("carries eliminationThreshold only when isEliminatory is true and a threshold is present", () => {
    const eliminatory = mapCriterionFinding(baseCriterion({ isEliminatory: true, threshold: "10/20" }));
    expect(eliminatory?.proposedValue).toMatchObject({ eliminationThreshold: "10/20" });

    const nonEliminatory = mapCriterionFinding(baseCriterion({ isEliminatory: false, threshold: "10/20" }));
    expect(nonEliminatory?.proposedValue).not.toHaveProperty("eliminationThreshold");
  });

  it("returns null when no weight was extracted", () => {
    expect(mapCriterionFinding(baseCriterion({ weight: undefined }))).toBeNull();
    expect(mapCriterionFinding(baseCriterion({ weight: null }))).toBeNull();
  });
});

describe("mapRequirementFinding", () => {
  it("always maps to a TENDER_REQUESTED_DOCUMENT creation proposal", () => {
    const mapped = mapRequirementFinding(baseRequirement({ expectedFormat: "PDF signé" }));
    expect(mapped).toMatchObject({
      entityType: AiSuggestionEntityType.TenderRequestedDocument,
      fieldName: CREATE_FIELD_SENTINEL,
      proposedValue: { name: "Attestation d'assurance", category: "ADMINISTRATIVE", required: true, description: "PDF signé" },
    });
  });
});

describe("mapRiskFinding", () => {
  it("always maps to a TENDER_RISK creation proposal, normalizing a matching category", () => {
    const mapped = mapRiskFinding(baseRisk({ category: "planning" }));
    expect(mapped).toMatchObject({
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
    expect(mapped?.proposedValue).not.toHaveProperty("category");
  });
});
