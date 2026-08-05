import { describe, expect, it } from "vitest";
import { AdministrativeChecklistLineState, computeAdministrativeChecklist, type ConfirmedRequirementView } from "./administrative-checklist";

const NOW = new Date("2026-09-10T10:00:00.000Z");

function requirement(overrides: Partial<ConfirmedRequirementView> & { requirementId: string }): ConfirmedRequirementView {
  return {
    title: "Attestation fiscale",
    expectedDocumentType: "ATTESTATION_FISCALE",
    required: true,
    applicable: true,
    signatureRequired: false,
    ...overrides,
  };
}

describe("computeAdministrativeChecklist — mission §9", () => {
  it("is deterministic: the same input twice produces identical output", () => {
    const input = {
      requirements: [requirement({ requirementId: "r1" })],
      documentsById: new Map(),
      revisionsByDocumentId: new Map(),
      now: NOW,
    };
    expect(computeAdministrativeChecklist(input)).toEqual(computeAdministrativeChecklist(input));
  });

  it("returns MANQUANT and excludes it from completion when no document is matched (missing mandatory document)", () => {
    const result = computeAdministrativeChecklist({
      requirements: [requirement({ requirementId: "r1" })],
      documentsById: new Map(),
      revisionsByDocumentId: new Map(),
      now: NOW,
    });
    expect(result.lines[0]?.state).toBe(AdministrativeChecklistLineState.Manquant);
    expect(result.completionPercentage).toBe(0);
  });

  it("excludes NON_APPLICABLE lines from the completion denominator", () => {
    const result = computeAdministrativeChecklist({
      requirements: [requirement({ requirementId: "r1", applicable: false }), requirement({ requirementId: "r2", matchedDocumentId: "doc-1" })],
      documentsById: new Map([["doc-1", { documentId: "doc-1", validatedRevisionId: "rev-1" }]]),
      revisionsByDocumentId: new Map([["doc-1", [{ revisionId: "rev-1", status: "VALIDATED", hasAttachedFile: true }]]]),
      now: NOW,
    });
    expect(result.lines[0]?.state).toBe(AdministrativeChecklistLineState.NonApplicable);
    expect(result.lines[1]?.state).toBe(AdministrativeChecklistLineState.Valide);
    // 1 applicable line, fully VALIDE → 100%, NOT diluted by the non-applicable one.
    expect(result.completionPercentage).toBe(100);
  });

  it("returns A_COMPLETER when a document is matched but has no revision with an attached file yet", () => {
    const result = computeAdministrativeChecklist({
      requirements: [requirement({ requirementId: "r1", matchedDocumentId: "doc-1" })],
      documentsById: new Map([["doc-1", { documentId: "doc-1" }]]),
      revisionsByDocumentId: new Map([["doc-1", [{ revisionId: "rev-1", status: "DRAFT", hasAttachedFile: false }]]]),
      now: NOW,
    });
    expect(result.lines[0]?.state).toBe(AdministrativeChecklistLineState.ACompleter);
  });

  it("returns A_VERIFIER when a file is attached but not yet submitted for review", () => {
    const result = computeAdministrativeChecklist({
      requirements: [requirement({ requirementId: "r1", matchedDocumentId: "doc-1" })],
      documentsById: new Map([["doc-1", { documentId: "doc-1" }]]),
      revisionsByDocumentId: new Map([["doc-1", [{ revisionId: "rev-1", status: "DRAFT", hasAttachedFile: true }]]]),
      now: NOW,
    });
    expect(result.lines[0]?.state).toBe(AdministrativeChecklistLineState.AVerifier);
  });

  it("returns EN_VALIDATION when the latest revision with a file has been submitted for review", () => {
    const result = computeAdministrativeChecklist({
      requirements: [requirement({ requirementId: "r1", matchedDocumentId: "doc-1" })],
      documentsById: new Map([["doc-1", { documentId: "doc-1" }]]),
      revisionsByDocumentId: new Map([["doc-1", [{ revisionId: "rev-1", status: "IN_REVIEW", hasAttachedFile: true }]]]),
      now: NOW,
    });
    expect(result.lines[0]?.state).toBe(AdministrativeChecklistLineState.EnValidation);
  });

  it("returns VALIDE when the document's validated revision is not expired", () => {
    const result = computeAdministrativeChecklist({
      requirements: [requirement({ requirementId: "r1", matchedDocumentId: "doc-1" })],
      documentsById: new Map([["doc-1", { documentId: "doc-1", validatedRevisionId: "rev-1" }]]),
      revisionsByDocumentId: new Map([["doc-1", [{ revisionId: "rev-1", status: "VALIDATED", hasAttachedFile: true, expiresAt: new Date("2026-12-31") }]]]),
      now: NOW,
    });
    expect(result.lines[0]?.state).toBe(AdministrativeChecklistLineState.Valide);
  });

  it("returns EXPIRE when the document's validated revision has expired", () => {
    const result = computeAdministrativeChecklist({
      requirements: [requirement({ requirementId: "r1", matchedDocumentId: "doc-1" })],
      documentsById: new Map([["doc-1", { documentId: "doc-1", validatedRevisionId: "rev-1" }]]),
      revisionsByDocumentId: new Map([["doc-1", [{ revisionId: "rev-1", status: "VALIDATED", hasAttachedFile: true, expiresAt: new Date("2026-01-01") }]]]),
      now: NOW,
    });
    expect(result.lines[0]?.state).toBe(AdministrativeChecklistLineState.Expire);
    // EXPIRE is never counted as done.
    expect(result.completionPercentage).toBe(0);
  });

  it("computes a partial completion percentage across several applicable requirements", () => {
    const result = computeAdministrativeChecklist({
      requirements: [requirement({ requirementId: "r1", matchedDocumentId: "doc-1" }), requirement({ requirementId: "r2" })],
      documentsById: new Map([["doc-1", { documentId: "doc-1", validatedRevisionId: "rev-1" }]]),
      revisionsByDocumentId: new Map([["doc-1", [{ revisionId: "rev-1", status: "VALIDATED", hasAttachedFile: true }]]]),
      now: NOW,
    });
    expect(result.completionPercentage).toBe(50);
  });
});
