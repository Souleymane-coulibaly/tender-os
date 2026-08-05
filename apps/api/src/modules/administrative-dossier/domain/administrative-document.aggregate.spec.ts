import { describe, expect, it } from "vitest";
import { AdministrativeDocumentType } from "./administrative-document-type";
import { AdministrativeDocument } from "./administrative-document.aggregate";
import { AdministrativeSignatureMode, AdministrativeSignatureStatus } from "./administrative-signature";
import { AdministrativeDocumentAlreadyValidatedWithDifferentRevisionError, AdministrativeSignatureModeMismatchError, AdministrativeSignatureNotRequiredError } from "./errors";

const NOW = new Date("2026-09-10T10:00:00.000Z");

function baseInput() {
  return {
    id: "doc-1",
    organizationId: "org-1",
    administrativeDossierId: "dossier-1",
    tenderId: "tender-1",
    documentType: AdministrativeDocumentType.AttestationFiscale,
    label: "Attestation fiscale",
    createdBy: "user-1",
    occurredAt: NOW,
  };
}

describe("AdministrativeDocument — mission §21 reproductibilité", () => {
  it("markValidated pins an exact revisionId", () => {
    const document = AdministrativeDocument.create(baseInput());
    document.markValidated({ revisionId: "rev-1", validatedBy: "user-2", occurredAt: NOW });
    expect(document.validatedRevisionId).toBe("rev-1");
    expect(document.validatedBy).toBe("user-2");
  });

  it("re-validating the exact same revisionId is an idempotent no-op", () => {
    const document = AdministrativeDocument.create(baseInput());
    document.markValidated({ revisionId: "rev-1", validatedBy: "user-2", occurredAt: NOW });
    expect(() => document.markValidated({ revisionId: "rev-1", validatedBy: "user-2", occurredAt: NOW })).not.toThrow();
  });

  it("refuses validating a different revision while one is already validated", () => {
    const document = AdministrativeDocument.create(baseInput());
    document.markValidated({ revisionId: "rev-1", validatedBy: "user-2", occurredAt: NOW });
    expect(() => document.markValidated({ revisionId: "rev-2", validatedBy: "user-2", occurredAt: NOW })).toThrow(
      AdministrativeDocumentAlreadyValidatedWithDifferentRevisionError,
    );
  });

  it("clearValidation reopens validation — a new revision after validation always calls this first", () => {
    const document = AdministrativeDocument.create(baseInput());
    document.markValidated({ revisionId: "rev-1", validatedBy: "user-2", occurredAt: NOW });
    document.clearValidation(NOW);
    expect(document.validatedRevisionId).toBeUndefined();
    expect(document.validatedBy).toBeUndefined();
    expect(document.validatedAt).toBeUndefined();
    // Now a different revision can be validated without conflict.
    expect(() => document.markValidated({ revisionId: "rev-2", validatedBy: "user-2", occurredAt: NOW })).not.toThrow();
  });
});

describe("AdministrativeDocument — signature locale, mission §18", () => {
  it("starts NOT_REQUIRED / NOT_REQUIRED", () => {
    const document = AdministrativeDocument.create(baseInput());
    expect(document.signatureMode).toBe(AdministrativeSignatureMode.NotRequired);
    expect(document.signatureStatus).toBe(AdministrativeSignatureStatus.NotRequired);
  });

  it("setSignatureMode to a required mode moves status to PENDING — the only place PENDING is ever set", () => {
    const document = AdministrativeDocument.create(baseInput());
    document.setSignatureMode({ mode: AdministrativeSignatureMode.Manual, occurredAt: NOW });
    expect(document.signatureStatus).toBe(AdministrativeSignatureStatus.Pending);
  });

  it("setSignatureMode back to NOT_REQUIRED forces status back to NOT_REQUIRED, never leaves a stale PENDING", () => {
    const document = AdministrativeDocument.create(baseInput());
    document.setSignatureMode({ mode: AdministrativeSignatureMode.Manual, occurredAt: NOW });
    document.setSignatureMode({ mode: AdministrativeSignatureMode.NotRequired, occurredAt: NOW });
    expect(document.signatureStatus).toBe(AdministrativeSignatureStatus.NotRequired);
  });

  it("recordManualSignature requires MANUAL mode and moves PENDING -> SIGNED", () => {
    const document = AdministrativeDocument.create(baseInput());
    document.setSignatureMode({ mode: AdministrativeSignatureMode.Manual, occurredAt: NOW });
    document.recordManualSignature(NOW);
    expect(document.signatureStatus).toBe(AdministrativeSignatureStatus.Signed);
  });

  it("recordManualSignature refuses when mode is ELECTRONIC", () => {
    const document = AdministrativeDocument.create(baseInput());
    document.setSignatureMode({ mode: AdministrativeSignatureMode.Electronic, occurredAt: NOW });
    expect(() => document.recordManualSignature(NOW)).toThrow(AdministrativeSignatureModeMismatchError);
  });

  it("any signature action refuses when mode is NOT_REQUIRED — mission 'aucun blocage, jamais un PENDING auto-créé'", () => {
    const document = AdministrativeDocument.create(baseInput());
    expect(() => document.recordManualSignature(NOW)).toThrow(AdministrativeSignatureNotRequiredError);
  });

  it("recordExternalSignatureProof requires EXTERNAL mode and moves PENDING -> SIGNED", () => {
    const document = AdministrativeDocument.create(baseInput());
    document.setSignatureMode({ mode: AdministrativeSignatureMode.External, occurredAt: NOW });
    document.recordExternalSignatureProof(NOW);
    expect(document.signatureStatus).toBe(AdministrativeSignatureStatus.Signed);
  });

  it("rejectSignature moves PENDING -> REJECTED", () => {
    const document = AdministrativeDocument.create(baseInput());
    document.setSignatureMode({ mode: AdministrativeSignatureMode.Manual, occurredAt: NOW });
    document.rejectSignature(NOW);
    expect(document.signatureStatus).toBe(AdministrativeSignatureStatus.Rejected);
  });
});
