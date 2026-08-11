import { describe, expect, it } from "vitest";
import { derivePackageItemStatus, isBlockingIfMissing } from "./derive-package-item-status";
import { PackageItemApplicabilityStatus, PackageItemRequirementType, PackageItemStatus } from "../enums";

describe("derivePackageItemStatus — mission blocking rule (§3, §26-28, §97-102)", () => {
  it("BLOQUANT — REQUIRED + APPLICABLE + MISSING → MISSING_BLOCKING (§97)", () => {
    expect(
      derivePackageItemStatus({ requirementType: PackageItemRequirementType.Required, applicabilityStatus: PackageItemApplicabilityStatus.Applicable, hasDocumentVersion: false }),
    ).toBe(PackageItemStatus.MissingBlocking);
  });

  it("BLOQUANT — OPTIONAL + MISSING → MISSING_NON_BLOCKING, never blocking (§98)", () => {
    expect(
      derivePackageItemStatus({ requirementType: PackageItemRequirementType.Optional, applicabilityStatus: PackageItemApplicabilityStatus.Applicable, hasDocumentVersion: false }),
    ).toBe(PackageItemStatus.MissingNonBlocking);
  });

  it("BLOQUANT — NOT_APPLICABLE always wins regardless of requirementType or presence (§29, §99, §100)", () => {
    for (const requirementType of Object.values(PackageItemRequirementType)) {
      for (const hasDocumentVersion of [true, false]) {
        expect(derivePackageItemStatus({ requirementType, applicabilityStatus: PackageItemApplicabilityStatus.NotApplicable, hasDocumentVersion })).toBe(PackageItemStatus.NotApplicable);
      }
    }
  });

  it("BLOQUANT — CONDITIONAL resolved to APPLICABLE + MISSING blocks like REQUIRED (§101)", () => {
    expect(
      derivePackageItemStatus({ requirementType: PackageItemRequirementType.Conditional, applicabilityStatus: PackageItemApplicabilityStatus.Applicable, hasDocumentVersion: false }),
    ).toBe(PackageItemStatus.MissingBlocking);
  });

  it("BLOQUANT — NEEDS_REVIEW never auto-becomes a blocking missing-required (§35, §47, §102)", () => {
    expect(
      derivePackageItemStatus({ requirementType: PackageItemRequirementType.Required, applicabilityStatus: PackageItemApplicabilityStatus.NeedsReview, hasDocumentVersion: false }),
    ).toBe(PackageItemStatus.NeedsReview);
  });

  it("a present document is READY regardless of requirement type, as long as applicable", () => {
    for (const requirementType of Object.values(PackageItemRequirementType)) {
      expect(derivePackageItemStatus({ requirementType, applicabilityStatus: PackageItemApplicabilityStatus.Applicable, hasDocumentVersion: true })).toBe(PackageItemStatus.Ready);
    }
  });
});

describe("isBlockingIfMissing", () => {
  it("is false for OPTIONAL even when applicable", () => {
    expect(isBlockingIfMissing({ requirementType: PackageItemRequirementType.Optional, applicabilityStatus: PackageItemApplicabilityStatus.Applicable })).toBe(false);
  });
  it("is false for anything not APPLICABLE", () => {
    expect(isBlockingIfMissing({ requirementType: PackageItemRequirementType.Required, applicabilityStatus: PackageItemApplicabilityStatus.NotApplicable })).toBe(false);
    expect(isBlockingIfMissing({ requirementType: PackageItemRequirementType.Required, applicabilityStatus: PackageItemApplicabilityStatus.NeedsReview })).toBe(false);
  });
});
