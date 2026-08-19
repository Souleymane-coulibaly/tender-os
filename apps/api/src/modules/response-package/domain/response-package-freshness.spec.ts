import { describe, expect, it } from "vitest";
import { PackageItemApplicabilityStatus, PackageItemRequirementType, PackageItemSourceType } from "./enums";
import { computeResponsePackageFreshness, ResponsePackageFreshness } from "./response-package-freshness";

function item(
  overrides: Partial<{ sourceType: PackageItemSourceType; sourceId: string; documentVersionId: string; requirementType: PackageItemRequirementType; applicabilityStatus: PackageItemApplicabilityStatus }> = {},
) {
  return {
    sourceType: PackageItemSourceType.AdministrativeDocument,
    sourceId: "doc-1",
    documentVersionId: "v1",
    requirementType: PackageItemRequirementType.Required,
    applicabilityStatus: PackageItemApplicabilityStatus.Applicable,
    ...overrides,
  };
}

describe("computeResponsePackageFreshness (Checkpoint 2.1-P2.1-FIX-E)", () => {
  it("UNKNOWN when the package has no version built yet", () => {
    const result = computeResponsePackageFreshness({ version: null, currentCandidateCompanyId: undefined, currentExpectedItems: [] });
    expect(result).toBe(ResponsePackageFreshness.Unknown);
  });

  it("CURRENT when candidate matches and item sets are identical", () => {
    const result = computeResponsePackageFreshness({
      version: { candidateCompanyId: "candidate-alpha", items: [item()] },
      currentCandidateCompanyId: "candidate-alpha",
      currentExpectedItems: [item()],
    });
    expect(result).toBe(ResponsePackageFreshness.Current);
  });

  // BLOQUANT (mission §38) — un changement de Candidate rend le package STALE.
  it("BLOQUANT — STALE when the tender's current candidate differs from the one captured when the version was built", () => {
    const result = computeResponsePackageFreshness({
      version: { candidateCompanyId: "candidate-alpha", items: [item()] },
      currentCandidateCompanyId: "candidate-beta",
      currentExpectedItems: [item()],
    });
    expect(result).toBe(ResponsePackageFreshness.Stale);
  });

  // BLOQUANT (mission §40) — un document administratif a une nouvelle version courante : le
  // package qui référence l'ancienne devient STALE.
  it("BLOQUANT — STALE when a source's current documentVersionId differs from the one frozen in the package", () => {
    const result = computeResponsePackageFreshness({
      version: { candidateCompanyId: undefined, items: [item({ documentVersionId: "v1" })] },
      currentCandidateCompanyId: undefined,
      currentExpectedItems: [item({ documentVersionId: "v2" })],
    });
    expect(result).toBe(ResponsePackageFreshness.Stale);
  });

  // BLOQUANT (mission §35) — une nouvelle pièce requise est apparue depuis la construction de cette
  // version (ex. nouvel item Checklist).
  it("BLOQUANT — STALE when a currently expected item did not exist when the version was built", () => {
    const result = computeResponsePackageFreshness({
      version: { candidateCompanyId: undefined, items: [item({ sourceId: "doc-1" })] },
      currentCandidateCompanyId: undefined,
      currentExpectedItems: [item({ sourceId: "doc-1" }), item({ sourceId: "doc-2", sourceType: PackageItemSourceType.TechnicalMemo })],
    });
    expect(result).toBe(ResponsePackageFreshness.Stale);
  });

  it("STALE when a persisted item's source has since disappeared", () => {
    const result = computeResponsePackageFreshness({
      version: { candidateCompanyId: undefined, items: [item({ sourceId: "doc-1" }), item({ sourceId: "doc-2" })] },
      currentCandidateCompanyId: undefined,
      currentExpectedItems: [item({ sourceId: "doc-1" })],
    });
    expect(result).toBe(ResponsePackageFreshness.Stale);
  });

  it("STALE when a checklist-driven item's qualification (requirementType/applicabilityStatus) changed", () => {
    const result = computeResponsePackageFreshness({
      version: { candidateCompanyId: undefined, items: [item({ requirementType: PackageItemRequirementType.Optional })] },
      currentCandidateCompanyId: undefined,
      currentExpectedItems: [item({ requirementType: PackageItemRequirementType.Required })],
    });
    expect(result).toBe(ResponsePackageFreshness.Stale);
  });
});
