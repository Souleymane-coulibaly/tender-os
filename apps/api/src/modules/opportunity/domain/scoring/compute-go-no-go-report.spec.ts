import { describe, expect, it } from "vitest";
import type { QuickScoreCompanyProfileInput } from "./compute-opportunity-quick-score";
import { bucketRiskSeverity, computeGoNoGoReport, type ComputeGoNoGoReportInput } from "./compute-go-no-go-report";

const NOW = new Date("2026-03-01T00:00:00Z");

const COMPLETE_PROFILE: QuickScoreCompanyProfileInput = {
  hasLegalIdentity: true,
  validCertificationCount: 2,
  expiredCertificationCount: 0,
  validInsuranceCount: 1,
  expiredInsuranceCount: 0,
  matchingReferenceCount: 3,
  totalReferenceCount: 3,
  humanResourceCount: 2,
  materialResourceCount: 1,
  identityCompleteness: "COMPLETE",
};

function baseInput(overrides: Partial<ComputeGoNoGoReportInput> = {}): ComputeGoNoGoReportInput {
  return {
    now: NOW,
    submissionDeadline: new Date("2026-06-01T00:00:00Z"),
    analysis: {
      complexityLevel: "MEDIUM",
      mainRisksCount: 0,
      mainObligationsCount: 2,
      missingElementsCount: 0,
      pointsToClarifyCount: 0,
      goNoGoRecommendation: "GO",
      goNoGoRationale: "Dossier complet, aucun signal bloquant.",
    },
    findings: { requirementsTotal: 5, requirementsMandatory: 3, criteriaTotal: 4, criteriaEliminatory: 1, risksTotal: 0, risksHigh: 0, risksCritical: 0 },
    requestedDocuments: { total: 5, required: 3, eliminatory: 1, eliminatoryUnprovided: 0, requiredUnprovided: 0 },
    dceDocumentCount: 8,
    lots: { total: 1, selectedForResponse: 1 },
    aiSuggestions: { accepted: 4, modified: 1, pending: 0, rejected: 0, total: 5 },
    companyProfile: COMPLETE_PROFILE,
    subcontractingFlags: [],
    ...overrides,
  };
}

describe("computeGoNoGoReport", () => {
  it("is deterministic: same input always produces the same output", () => {
    const input = baseInput();
    expect(computeGoNoGoReport(input)).toEqual(computeGoNoGoReport(input));
  });

  it("decomposes the global score into 7 weighted, justified categories summing their declared weights to 100", () => {
    const result = computeGoNoGoReport(baseInput());

    const categories = Object.values(result.categoryScores);
    expect(categories).toHaveLength(7);
    const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0);
    expect(totalWeight).toBe(100);
    for (const category of categories) {
      expect(category.justification).toBeTruthy();
    }
  });

  it("derives the GO/GO_CONDITIONAL/NO_GO recommendation strictly from the documented thresholds", () => {
    const strong = computeGoNoGoReport(baseInput());
    expect(strong.globalScore).toBeGreaterThanOrEqual(75);
    expect(strong.recommendation).toBe("GO");

    const weak = computeGoNoGoReport(
      baseInput({
        companyProfile: undefined,
        requestedDocuments: { total: 5, required: 3, eliminatory: 3, eliminatoryUnprovided: 3, requiredUnprovided: 3 },
        findings: { requirementsTotal: 0, requirementsMandatory: 0, criteriaTotal: 0, criteriaEliminatory: 0, risksTotal: 0, risksHigh: 0, risksCritical: 0 },
      }),
    );
    expect(weak.recommendation).not.toBe("GO");
  });

  it("never lets a detected blocker silently override the score-derived recommendation", () => {
    const result = computeGoNoGoReport(baseInput({ requestedDocuments: { total: 5, required: 3, eliminatory: 1, eliminatoryUnprovided: 1, requiredUnprovided: 0 } }));

    expect(result.blockers.length).toBeGreaterThan(0);
    // La recommandation reste dérivée UNIQUEMENT du score, jamais changée automatiquement par un blocage.
    expect(result.recommendation).toBe(result.globalScore >= 75 ? "GO" : result.globalScore >= 50 ? "GO_CONDITIONAL" : "NO_GO");
  });

  it("flags a blocker when the submission deadline has already passed", () => {
    const result = computeGoNoGoReport(baseInput({ submissionDeadline: new Date("2026-01-01T00:00:00Z") }));
    expect(result.blockers.some((b) => b.category === "planning")).toBe(true);
  });

  it("never invents a financial capacity signal: always flags it as missing data with a neutral score", () => {
    const result = computeGoNoGoReport(baseInput());
    expect(result.categoryScores.financier.score).toBe(50);
    expect(result.missingInfo.some((m) => m.toLowerCase().includes("financière"))).toBe(true);
  });

  it("never uses PENDING ai suggestions as validated business truth, only signals them as missing data reducing confidence", () => {
    const withoutPending = computeGoNoGoReport(baseInput());
    const withPending = computeGoNoGoReport(baseInput({ aiSuggestions: { accepted: 4, modified: 1, pending: 5, rejected: 0, total: 10 } }));

    expect(withPending.confidence).toBeLessThan(withoutPending.confidence);
    expect(withPending.missingInfo.some((m) => m.includes("suggestion(s) IA en attente"))).toBe(true);
  });

  it("computes a higher documentary load as requested documents / DCE documents / requirements grow", () => {
    const low = computeGoNoGoReport(baseInput({ requestedDocuments: { total: 1, required: 1, eliminatory: 0, eliminatoryUnprovided: 0, requiredUnprovided: 0 }, dceDocumentCount: 2, lots: { total: 1, selectedForResponse: 1 }, findings: { requirementsTotal: 2, requirementsMandatory: 1, criteriaTotal: 1, criteriaEliminatory: 0, risksTotal: 0, risksHigh: 0, risksCritical: 0 } }));
    const high = computeGoNoGoReport(baseInput({ requestedDocuments: { total: 40, required: 30, eliminatory: 10, eliminatoryUnprovided: 0, requiredUnprovided: 0 }, dceDocumentCount: 60, lots: { total: 5, selectedForResponse: 5 }, findings: { requirementsTotal: 80, requirementsMandatory: 40, criteriaTotal: 10, criteriaEliminatory: 2, risksTotal: 0, risksHigh: 0, risksCritical: 0 } }));

    const order = ["LOW", "MEDIUM", "HIGH", "VERY_HIGH"];
    expect(order.indexOf(high.documentaryLoad)).toBeGreaterThan(order.indexOf(low.documentaryLoad));
  });

  it("never presents estimated prep time as a guarantee: always paired with the documentary load it derives from", () => {
    const result = computeGoNoGoReport(baseInput());
    expect(result.estimatedPrepTime).toBeDefined();
    expect(["LOW", "MEDIUM", "HIGH"]).toContain(result.estimatedPrepTime.administratif);
  });

  it("surfaces a subcontracting signal only as a factual flag, never as an automatic attachment", () => {
    const result = computeGoNoGoReport(baseInput({ subcontractingFlags: ["Clause de sous-traitance identifiée au CCAP art. 12"] }));
    expect(result.subcontractingFlags).toEqual(["Clause de sous-traitance identifiée au CCAP art. 12"]);
  });
});

describe("bucketRiskSeverity", () => {
  it("recognizes French and English severity labels case-insensitively", () => {
    expect(bucketRiskSeverity("critique")).toBe("CRITICAL");
    expect(bucketRiskSeverity("HIGH")).toBe("HIGH");
    expect(bucketRiskSeverity("Moyen")).toBe("MEDIUM");
    expect(bucketRiskSeverity("faible")).toBe("LOW");
  });

  it("never over-estimates an unrecognized value: defaults to LOW rather than failing silently upward", () => {
    expect(bucketRiskSeverity("unknown-value-from-a-future-ai-provider")).toBe("LOW");
  });
});
