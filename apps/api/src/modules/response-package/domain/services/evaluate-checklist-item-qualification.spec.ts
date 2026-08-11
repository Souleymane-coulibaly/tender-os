import { describe, expect, it } from "vitest";
import { evaluateChecklistItemQualification } from "./evaluate-checklist-item-qualification";
import { PackageItemApplicabilityStatus, PackageItemRequirementType } from "../enums";

describe("evaluateChecklistItemQualification — mission §20/§28/§39/§40/§99-102", () => {
  it("BLOQUANT — DC4-style: SUBCONTRACTOR + CONDITIONAL + no declared subcontractor → NOT_APPLICABLE (§40/§100)", () => {
    const result = evaluateChecklistItemQualification({
      requirementLevel: "CONDITIONAL",
      complianceStatus: "TO_REVIEW",
      subjectType: "SUBCONTRACTOR",
      hasDeclaredSubcontractors: false,
      isConsortiumBid: false,
    });
    expect(result).toEqual({ requirementType: PackageItemRequirementType.Conditional, applicabilityStatus: PackageItemApplicabilityStatus.NotApplicable });
  });

  it("BLOQUANT — DC4-style: SUBCONTRACTOR + CONDITIONAL + declared subcontractor → APPLICABLE (§40/§101)", () => {
    const result = evaluateChecklistItemQualification({
      requirementLevel: "CONDITIONAL",
      complianceStatus: "TO_REVIEW",
      subjectType: "SUBCONTRACTOR",
      hasDeclaredSubcontractors: true,
      isConsortiumBid: false,
    });
    expect(result.applicabilityStatus).toBe(PackageItemApplicabilityStatus.Applicable);
  });

  it("BLOQUANT — checklist complianceStatus=NOT_APPLICABLE always wins, even for MANDATORY (§29)", () => {
    const result = evaluateChecklistItemQualification({
      requirementLevel: "MANDATORY",
      complianceStatus: "NOT_APPLICABLE",
      subjectType: "CANDIDATE",
      hasDeclaredSubcontractors: false,
      isConsortiumBid: false,
    });
    expect(result.applicabilityStatus).toBe(PackageItemApplicabilityStatus.NotApplicable);
  });

  it("MANDATORY items are APPLICABLE by default → REQUIRED", () => {
    const result = evaluateChecklistItemQualification({
      requirementLevel: "MANDATORY",
      complianceStatus: "TO_REVIEW",
      subjectType: "CANDIDATE",
      hasDeclaredSubcontractors: false,
      isConsortiumBid: false,
    });
    expect(result).toEqual({ requirementType: PackageItemRequirementType.Required, applicabilityStatus: PackageItemApplicabilityStatus.Applicable });
  });

  it("INFORMATIONAL maps to OPTIONAL, applicable by default", () => {
    const result = evaluateChecklistItemQualification({
      requirementLevel: "INFORMATIONAL",
      complianceStatus: "TO_REVIEW",
      subjectType: "CANDIDATE",
      hasDeclaredSubcontractors: false,
      isConsortiumBid: false,
    });
    expect(result).toEqual({ requirementType: PackageItemRequirementType.Optional, applicabilityStatus: PackageItemApplicabilityStatus.Applicable });
  });

  it("BLOQUANT — a CONDITIONAL item whose condition this evaluator doesn't understand (e.g. subjectType=CANDIDATE) becomes NEEDS_REVIEW, never auto-REQUIRED (§28/§102)", () => {
    const result = evaluateChecklistItemQualification({
      requirementLevel: "CONDITIONAL",
      complianceStatus: "TO_REVIEW",
      subjectType: "CANDIDATE",
      hasDeclaredSubcontractors: false,
      isConsortiumBid: false,
    });
    expect(result.applicabilityStatus).toBe(PackageItemApplicabilityStatus.NeedsReview);
  });

  it("GROUP_MEMBER + CONDITIONAL resolves against isConsortiumBid", () => {
    expect(
      evaluateChecklistItemQualification({ requirementLevel: "CONDITIONAL", complianceStatus: "TO_REVIEW", subjectType: "GROUP_MEMBER", hasDeclaredSubcontractors: false, isConsortiumBid: true })
        .applicabilityStatus,
    ).toBe(PackageItemApplicabilityStatus.Applicable);
    expect(
      evaluateChecklistItemQualification({ requirementLevel: "CONDITIONAL", complianceStatus: "TO_REVIEW", subjectType: "GROUP_MEMBER", hasDeclaredSubcontractors: false, isConsortiumBid: false })
        .applicabilityStatus,
    ).toBe(PackageItemApplicabilityStatus.NotApplicable);
  });
});
