import { describe, expect, it } from "vitest";
import type { CompanyProfileSummary } from "../../../company-profile";
import { ChecklistItem, ChecklistItemType } from "../../../tenders";
import { matchChecklistItemDocuments } from "./checklist-document-matcher";

function checklistItem(overrides: Partial<Parameters<typeof ChecklistItem.create>[0]> = {}): ChecklistItem {
  return ChecklistItem.create({
    id: "item-1",
    organizationId: "org-1",
    tenderId: "tender-1",
    title: "Attestation d'assurance responsabilite civile",
    type: ChecklistItemType.Insurance,
    occurredAt: new Date(),
    ...overrides,
  });
}

function tenderDocument(id: string, title: string) {
  return { id, organizationId: "org-1", title, origin: "USER_UPLOAD", domain: "TENDER", status: "ACTIVE", currentVersionNumber: 1, createdByUserId: "u", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
}

function companyProfileWith(overrides: { insurances?: unknown[]; certifications?: unknown[] }): CompanyProfileSummary {
  return {
    clientAccountId: "client-1",
    legalIdentity: null,
    representatives: [],
    bankAccounts: [],
    insurances: (overrides.insurances ?? []) as CompanyProfileSummary["insurances"],
    certifications: (overrides.certifications ?? []) as CompanyProfileSummary["certifications"],
    references: [],
    humanResources: [],
    materialResources: [],
    documents: [],
    completeness: {} as CompanyProfileSummary["completeness"],
  };
}

function insuranceRecord(overrides: Partial<CompanyProfileSummary["insurances"][number]> = {}): CompanyProfileSummary["insurances"][number] {
  return {
    id: "ins-1",
    organizationId: "org-1",
    clientAccountId: "client-1",
    type: "PROFESSIONAL_LIABILITY",
    otherTypeLabel: null,
    insurer: null,
    policyNumber: null,
    startDate: null,
    expiresAt: null,
    coverageScope: null,
    coverageAmount: null,
    coverageCurrency: null,
    documentId: "doc-ins-1",
    lastVerifiedAt: null,
    status: "ACTIVE",
    createdBy: "u",
    createdAt: new Date(),
    updatedAt: new Date(),
    temporalStatus: "VALID",
    ...overrides,
  };
}

function certificationRecord(overrides: Partial<CompanyProfileSummary["certifications"][number]> = {}): CompanyProfileSummary["certifications"][number] {
  return {
    id: "cert-1",
    organizationId: "org-1",
    clientAccountId: "client-1",
    name: "Certification",
    issuer: null,
    number: null,
    type: null,
    scope: null,
    obtainedAt: null,
    expiresAt: null,
    documentId: "doc-cert-1",
    status: "ACTIVE",
    createdBy: "u",
    createdAt: new Date(),
    updatedAt: new Date(),
    temporalStatus: "NO_EXPIRY",
    ...overrides,
  };
}

describe("matchChecklistItemDocuments (V2 Sprint 6 §16-18)", () => {
  it("returns NO_MATCH when no candidate resembles the item at all", () => {
    const result = matchChecklistItemDocuments({
      item: checklistItem(),
      tenderDocuments: [tenderDocument("doc-1", "Planning previsionnel")],
    });

    expect(result.status).toBe("NO_MATCH");
    expect(result.candidates).toHaveLength(0);
  });

  it("returns EXACT_MATCH for a company insurance with a near-identical title and a governed matching type", () => {
    const result = matchChecklistItemDocuments({
      item: checklistItem({ title: "Assurance responsabilite civile professionnelle", type: ChecklistItemType.Insurance }),
      tenderDocuments: [],
      companyProfile: companyProfileWith({
        insurances: [insuranceRecord({ otherTypeLabel: "Assurance responsabilite civile professionnelle", expiresAt: new Date("2027-01-01"), documentId: "doc-ins-1" })],
      }),
    });

    expect(result.status).toBe("EXACT_MATCH");
    expect(result.candidates[0]?.documentId).toBe("doc-ins-1");
  });

  it("never associates automatically — always returns a ranked list, even on EXACT_MATCH", () => {
    const result = matchChecklistItemDocuments({
      item: checklistItem({ title: "Certification ISO 9001", type: ChecklistItemType.Certification }),
      tenderDocuments: [],
      companyProfile: companyProfileWith({ certifications: [certificationRecord({ name: "Certification ISO 9001", documentId: "doc-cert-1" })] }),
    });

    expect(result.status).toBe("EXACT_MATCH");
    // La classification renvoie toujours une liste — jamais un booléen "associé automatiquement".
    expect(Array.isArray(result.candidates)).toBe(true);
  });

  it("returns MULTIPLE_CANDIDATES when two candidates score within the tie margin", () => {
    const result = matchChecklistItemDocuments({
      item: checklistItem({ title: "Attestation assurance decennale", type: ChecklistItemType.Insurance }),
      tenderDocuments: [tenderDocument("doc-a", "Attestation assurance decennale batiment"), tenderDocument("doc-b", "Attestation assurance decennale travaux")],
    });

    expect(result.status).toBe("MULTIPLE_CANDIDATES");
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it("copies the expiration date from the satellite that produced the match, never inventing one when it is absent", () => {
    const result = matchChecklistItemDocuments({
      item: checklistItem({ title: "Certification Qualibat", type: ChecklistItemType.Certification }),
      tenderDocuments: [],
      companyProfile: companyProfileWith({ certifications: [certificationRecord({ name: "Certification Qualibat", documentId: "doc-cert-1", expiresAt: null })] }),
    });

    expect(result.candidates[0]?.expiresAt).toBeUndefined();
  });

  it("ignores a satellite record with no attached document (nothing to point to)", () => {
    const result = matchChecklistItemDocuments({
      item: checklistItem({ title: "Certification Qualibat", type: ChecklistItemType.Certification }),
      tenderDocuments: [],
      companyProfile: companyProfileWith({ certifications: [certificationRecord({ name: "Certification Qualibat", documentId: null })] }),
    });

    expect(result.status).toBe("NO_MATCH");
  });
});
