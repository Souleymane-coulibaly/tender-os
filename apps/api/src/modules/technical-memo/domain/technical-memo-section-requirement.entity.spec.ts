import { describe, expect, it } from "vitest";
import { TechnicalMemoCoverageStatus, TechnicalMemoRequirementFindingType } from "./enums";
import { TechnicalMemoSectionRequirement } from "./technical-memo-section-requirement.entity";

const OCCURRED_AT = new Date("2026-01-01T00:00:00Z");

function baseRequirement() {
  return TechnicalMemoSectionRequirement.create({
    id: "req-link-1",
    organizationId: "org-1",
    technicalMemoSectionId: "section-1",
    findingType: TechnicalMemoRequirementFindingType.Requirement,
    findingId: "finding-1",
    occurredAt: OCCURRED_AT,
  });
}

describe("TechnicalMemoSectionRequirement", () => {
  it("démarre NEEDS_REVIEW, non confirmée (mission §47 — jamais tranché seul par l'IA)", () => {
    const link = baseRequirement();
    expect(link.coverageStatus).toBe(TechnicalMemoCoverageStatus.NeedsReview);
    expect(link.confirmedByUser).toBe(false);
  });

  it("BLOQUANT — suggestCoverage est un no-op une fois confirmedByUser=true (même motif que suggestCategory)", () => {
    const link = baseRequirement();
    link.confirmCoverage({ coverageStatus: TechnicalMemoCoverageStatus.Covered, occurredAt: OCCURRED_AT });
    link.suggestCoverage({ coverageStatus: TechnicalMemoCoverageStatus.NotCovered, occurredAt: OCCURRED_AT });
    expect(link.coverageStatus).toBe(TechnicalMemoCoverageStatus.Covered);
    expect(link.confirmedByUser).toBe(true);
  });

  it("suggestCoverage s'applique tant que non confirmée", () => {
    const link = baseRequirement();
    link.suggestCoverage({ coverageStatus: TechnicalMemoCoverageStatus.PartiallyCovered, coverageReason: "mots-clés partiels", occurredAt: OCCURRED_AT });
    expect(link.coverageStatus).toBe(TechnicalMemoCoverageStatus.PartiallyCovered);
    expect(link.coverageReason).toBe("mots-clés partiels");
    expect(link.confirmedByUser).toBe(false);
  });
});
