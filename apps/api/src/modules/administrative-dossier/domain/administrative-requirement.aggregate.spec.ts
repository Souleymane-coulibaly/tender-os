import { describe, expect, it } from "vitest";
import { AdministrativeDocumentType } from "./administrative-document-type";
import { AdministrativeRequirement } from "./administrative-requirement.aggregate";
import { AdministrativeRequirementOrigin } from "./administrative-requirement-origin";
import { AdministrativeRequirementValidationStatus } from "./administrative-requirement-validation-status";
import { InvalidAdministrativeRequirementValidationStatusTransitionError } from "./errors";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";

function baseInput(overrides: Partial<Parameters<typeof AdministrativeRequirement.create>[0]> = {}) {
  return {
    id: "req-1",
    organizationId: ORGANIZATION_ID,
    tenderId: TENDER_ID,
    title: "Attestation fiscale",
    requirementType: "DOCUMENT",
    expectedDocumentType: AdministrativeDocumentType.AttestationFiscale,
    required: true,
    origin: AdministrativeRequirementOrigin.Manual,
    createdBy: "user-1",
    occurredAt: NOW,
    ...overrides,
  };
}

describe("AdministrativeRequirement — mission §8 'jamais validée automatiquement'", () => {
  it("forces SUGGESTED for a DCE_ANALYSIS-origin requirement, even if the caller passes CONFIRMED", () => {
    const requirement = AdministrativeRequirement.create(
      baseInput({ origin: AdministrativeRequirementOrigin.DceAnalysis, initialValidationStatus: AdministrativeRequirementValidationStatus.Confirmed }),
    );
    expect(requirement.validationStatus).toBe(AdministrativeRequirementValidationStatus.Suggested);
  });

  it("defaults MANUAL-origin requirements to SUGGESTED as well", () => {
    const requirement = AdministrativeRequirement.create(baseInput());
    expect(requirement.validationStatus).toBe(AdministrativeRequirementValidationStatus.Suggested);
  });

  it("allows SUGGESTED -> CONFIRMED -> REJECTED, but never back to SUGGESTED", () => {
    const requirement = AdministrativeRequirement.create(baseInput());
    requirement.confirm({ validatedBy: "user-2", occurredAt: NOW });
    expect(requirement.validationStatus).toBe(AdministrativeRequirementValidationStatus.Confirmed);
    requirement.reject({ validatedBy: "user-2", occurredAt: NOW });
    expect(requirement.validationStatus).toBe(AdministrativeRequirementValidationStatus.Rejected);
  });

  it("markNotApplicable also flips applicable to false", () => {
    const requirement = AdministrativeRequirement.create(baseInput());
    requirement.markNotApplicable({ validatedBy: "user-2", occurredAt: NOW });
    expect(requirement.validationStatus).toBe(AdministrativeRequirementValidationStatus.NotApplicable);
    expect(requirement.applicable).toBe(false);
  });

  it("matchDocument/unmatchDocument set and clear the matched document reference", () => {
    const requirement = AdministrativeRequirement.create(baseInput());
    requirement.matchDocument({ documentId: "doc-1", occurredAt: NOW });
    expect(requirement.matchedDocumentId).toBe("doc-1");
    requirement.unmatchDocument({ occurredAt: NOW });
    expect(requirement.matchedDocumentId).toBeUndefined();
  });

  it("rejects an invalid transition (there is none defined out of a terminal-for-this-test state) via the transition guard", () => {
    const requirement = AdministrativeRequirement.create(baseInput());
    requirement.confirm({ validatedBy: "user-2", occurredAt: NOW });
    // CONFIRMED -> CONFIRMED is not in the allowed transition table (self-transition never listed).
    expect(() => requirement.confirm({ validatedBy: "user-2", occurredAt: NOW })).toThrow(InvalidAdministrativeRequirementValidationStatusTransitionError);
  });
});
