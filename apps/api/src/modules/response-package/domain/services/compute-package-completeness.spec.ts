import { describe, expect, it } from "vitest";
import { computePackageCompleteness, type PackageCompletenessLineInput } from "./compute-package-completeness";
import { PackageItemApplicabilityStatus, PackageItemRequirementType } from "../enums";

function line(overrides: Partial<PackageCompletenessLineInput> & { id: string }): PackageCompletenessLineInput {
  return {
    label: overrides.id,
    requirementType: PackageItemRequirementType.Required,
    applicabilityStatus: PackageItemApplicabilityStatus.Applicable,
    hasDocumentVersion: true,
    ...overrides,
  };
}

describe("computePackageCompleteness — mission §5/§33/§103", () => {
  it("BLOQUANT — mission's exact example: 22 required applicable/22 available, 5 optional (3 missing), 4 N/A → 100%, never 22/31 (§5/§67/§103)", () => {
    const items: PackageCompletenessLineInput[] = [
      ...Array.from({ length: 22 }, (_, i) => line({ id: `req-${i}`, hasDocumentVersion: true })),
      ...Array.from({ length: 2 }, (_, i) => line({ id: `opt-avail-${i}`, requirementType: PackageItemRequirementType.Optional, hasDocumentVersion: true })),
      ...Array.from({ length: 3 }, (_, i) => line({ id: `opt-missing-${i}`, requirementType: PackageItemRequirementType.Optional, hasDocumentVersion: false })),
      ...Array.from({ length: 4 }, (_, i) => line({ id: `na-${i}`, applicabilityStatus: PackageItemApplicabilityStatus.NotApplicable, hasDocumentVersion: false })),
    ];
    const result = computePackageCompleteness(items);
    expect(result.requiredApplicableTotal).toBe(22);
    expect(result.requiredAvailable).toBe(22);
    expect(result.requiredMissing).toBe(0);
    expect(result.requiredCompletenessRatio).toBe(1);
    expect(result.optionalApplicableTotal).toBe(5);
    expect(result.optionalMissing).toBe(3);
    expect(result.notApplicableTotal).toBe(4);
    expect(result.ready).toBe(true);
  });

  it("BLOQUANT — a single REQUIRED+APPLICABLE+MISSING item blocks readiness and is named in requiredMissingLabels (§44/§97)", () => {
    const items = [line({ id: "a", label: "Attestation fiscale", hasDocumentVersion: false })];
    const result = computePackageCompleteness(items);
    expect(result.ready).toBe(false);
    expect(result.requiredMissingLabels).toEqual(["Attestation fiscale"]);
  });

  it("BLOQUANT — OPTIONAL missing never blocks readiness (§43/§98)", () => {
    const items = [
      ...Array.from({ length: 10 }, (_, i) => line({ id: `req-${i}` })),
      ...Array.from({ length: 5 }, (_, i) => line({ id: `opt-${i}`, requirementType: PackageItemRequirementType.Optional, hasDocumentVersion: i < 2 })),
    ];
    const result = computePackageCompleteness(items);
    expect(result.ready).toBe(true);
  });

  it("BLOQUANT — NOT_APPLICABLE and NEEDS_REVIEW items never block readiness (§45/§46/§47)", () => {
    const items = [
      line({ id: "req", hasDocumentVersion: true }),
      line({ id: "na", applicabilityStatus: PackageItemApplicabilityStatus.NotApplicable, hasDocumentVersion: false }),
      line({ id: "review", applicabilityStatus: PackageItemApplicabilityStatus.NeedsReview, hasDocumentVersion: false }),
    ];
    const result = computePackageCompleteness(items);
    expect(result.ready).toBe(true);
    expect(result.needsReviewTotal).toBe(1);
    expect(result.notApplicableTotal).toBe(1);
  });

  it("returns an undefined ratio (never a fabricated 100%/0%) when nothing is actually required", () => {
    const items = [line({ id: "opt", requirementType: PackageItemRequirementType.Optional, hasDocumentVersion: false })];
    expect(computePackageCompleteness(items).requiredCompletenessRatio).toBeUndefined();
  });

  it("a CONDITIONAL item resolved APPLICABLE counts toward required completeness, not optional (§101)", () => {
    const items = [line({ id: "dc4", requirementType: PackageItemRequirementType.Conditional, hasDocumentVersion: false })];
    const result = computePackageCompleteness(items);
    expect(result.requiredApplicableTotal).toBe(1);
    expect(result.optionalApplicableTotal).toBe(0);
    expect(result.ready).toBe(false);
  });
});
