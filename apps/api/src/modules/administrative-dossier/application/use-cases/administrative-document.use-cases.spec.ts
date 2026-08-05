import { describe, expect, it, vi } from "vitest";
import {
  AttachAdministrativeDocumentRevisionUseCase,
  CreateAdministrativeDocumentUseCase,
  RejectAdministrativeDocumentUseCase,
  ValidateAdministrativeDocumentUseCase,
} from "./administrative-document.use-cases";
import type { AdministrativeDocumentRepository } from "../ports/administrative-document.repository";
import type { AdministrativeDocumentRevisionRepository } from "../ports/administrative-document-revision.repository";
import type { AdministrativeRequirementRepository } from "../ports/administrative-requirement.repository";
import type { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import type { AdministrativeDossierRecalculationService } from "../services/administrative-dossier-recalculation.service";
import type { GetDocumentUseCase } from "../../../documents";
import type { AuditLogWriter } from "../ports/audit-log-writer";
import { AdministrativeDocumentType } from "../../domain/administrative-document-type";
import { AdministrativeDocument } from "../../domain/administrative-document.aggregate";
import { AdministrativeDocumentRevision } from "../../domain/administrative-document-revision.entity";
import { AdministrativeDocumentNotReadyForValidationError, AdministrativeDocumentAlreadyValidatedWithDifferentRevisionError } from "../../domain/errors";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";
const DOSSIER_ID = "dossier-1";

function fakeClock() {
  return { now: () => NOW };
}
function fakeIdGenerator() {
  let n = 0;
  return { generate: () => `rev-${(n += 1)}` };
}
function fakeAccessService(): AdministrativeDossierAccessService {
  return {
    assertTenderAccess: vi.fn(async () => "client-1"),
    loadDossierByTenderId: vi.fn(async () => ({ dossier: { id: DOSSIER_ID, tenderId: TENDER_ID }, clientAccountId: "client-1" })),
  } as unknown as AdministrativeDossierAccessService;
}
function fakeStatusRecalculation(): AdministrativeDossierRecalculationService {
  return { recompute: vi.fn(async () => {}) } as unknown as AdministrativeDossierRecalculationService;
}
function fakeAuditLogWriter(): AuditLogWriter {
  return { record: vi.fn(async () => {}) };
}
function fakeRequirementRepository(): AdministrativeRequirementRepository {
  return { create: async () => {}, findById: async () => null, listByTender: async () => [], listConfirmedByTender: async () => [], save: async () => {} };
}
function fakeGetDocumentUseCase(): GetDocumentUseCase {
  return {
    execute: vi.fn(async ({ documentId }: { documentId: string }) => ({
      id: documentId,
      currentVersion: { id: "version-1", checksum: "abc123", sanitizedFilename: "attestation.pdf", mimeType: "application/pdf" },
    })),
  } as unknown as GetDocumentUseCase;
}
function inMemoryDocumentRepository(seed: AdministrativeDocument[] = []): AdministrativeDocumentRepository {
  const rows = new Map(seed.map((d) => [d.id, d]));
  return {
    create: async (d) => void rows.set(d.id, d),
    findById: async ({ documentId }) => rows.get(documentId) ?? null,
    listByDossier: async () => [...rows.values()],
    findByRequirementId: async () => null,
    save: async (d) => void rows.set(d.id, d),
  };
}
function inMemoryRevisionRepository(seed: AdministrativeDocumentRevision[] = []): AdministrativeDocumentRevisionRepository {
  const rows = new Map(seed.map((r) => [r.id, r]));
  return {
    create: async (r) => void rows.set(r.id, r),
    findById: async ({ revisionId }) => rows.get(revisionId) ?? null,
    listByDocument: async ({ administrativeDocumentId }) => [...rows.values()].filter((r) => r.administrativeDocumentId === administrativeDocumentId).sort((a, b) => a.revisionNumber - b.revisionNumber),
    save: async (r) => void rows.set(r.id, r),
  };
}

function baseDocument() {
  return AdministrativeDocument.create({
    id: "doc-1",
    organizationId: ORGANIZATION_ID,
    administrativeDossierId: DOSSIER_ID,
    tenderId: TENDER_ID,
    documentType: AdministrativeDocumentType.AttestationFiscale,
    label: "Attestation fiscale",
    createdBy: "user-1",
    occurredAt: NOW,
  });
}
function draftRevision(overrides: { revisionNumber?: number } = {}) {
  return AdministrativeDocumentRevision.create({
    id: `rev-seed-${overrides.revisionNumber ?? 1}`,
    organizationId: ORGANIZATION_ID,
    administrativeDocumentId: "doc-1",
    revisionNumber: overrides.revisionNumber ?? 1,
    createdBy: "user-1",
    occurredAt: NOW,
  });
}

describe("CreateAdministrativeDocumentUseCase", () => {
  it("creates a document with an initial empty DRAFT revision", async () => {
    const documentRepository = inMemoryDocumentRepository();
    const revisionRepository = inMemoryRevisionRepository();
    const useCase = new CreateAdministrativeDocumentUseCase(fakeAccessService(), documentRepository, revisionRepository, fakeRequirementRepository(), fakeAuditLogWriter(), fakeStatusRecalculation(), fakeClock(), fakeIdGenerator());

    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, documentType: AdministrativeDocumentType.AttestationFiscale, label: "Attestation fiscale" });

    expect(summary.revisions).toHaveLength(1);
    expect(summary.revisions[0]?.status).toBe("DRAFT");
    expect(summary.validatedRevisionId).toBeUndefined();
  });
});

describe("AttachAdministrativeDocumentRevisionUseCase — mission §21", () => {
  it("attaches a verified document to the existing DRAFT revision and submits it for review", async () => {
    const document = baseDocument();
    const revision = draftRevision();
    const documentRepository = inMemoryDocumentRepository([document]);
    const revisionRepository = inMemoryRevisionRepository([revision]);
    const getDocumentUseCase = fakeGetDocumentUseCase();
    const statusRecalculation = fakeStatusRecalculation();
    const useCase = new AttachAdministrativeDocumentRevisionUseCase(fakeAccessService(), documentRepository, revisionRepository, getDocumentUseCase, fakeAuditLogWriter(), statusRecalculation, fakeClock(), fakeIdGenerator());

    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", administrativeDocumentId: "doc-1", documentId: "doc-ext-1" });

    expect(summary.revisions).toHaveLength(1);
    expect(summary.revisions[0]?.status).toBe("IN_REVIEW");
    expect(summary.revisions[0]?.documentChecksum).toBe("abc123");
    expect(statusRecalculation.recompute).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID, dossierId: DOSSIER_ID });
  });

  it("creates a NEW revision (never mutating) when the latest revision is already validated, and clears the prior validation", async () => {
    const document = baseDocument();
    const validated = draftRevision();
    validated.attachDocument({ documentId: "doc-ext-1", documentVersionId: "v1", documentChecksum: "abc", documentFileName: "f.pdf", documentMimeType: "application/pdf", occurredAt: NOW });
    validated.submitForReview(NOW);
    validated.validate(NOW);
    document.markValidated({ revisionId: validated.id, validatedBy: "user-1", occurredAt: NOW });

    const documentRepository = inMemoryDocumentRepository([document]);
    const revisionRepository = inMemoryRevisionRepository([validated]);
    const useCase = new AttachAdministrativeDocumentRevisionUseCase(fakeAccessService(), documentRepository, revisionRepository, fakeGetDocumentUseCase(), fakeAuditLogWriter(), fakeStatusRecalculation(), fakeClock(), fakeIdGenerator());

    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", administrativeDocumentId: "doc-1", documentId: "doc-ext-2" });

    expect(summary.revisions).toHaveLength(2);
    expect(summary.revisions[0]?.status).toBe("REPLACED");
    expect(summary.revisions[1]?.status).toBe("IN_REVIEW");
    expect(summary.validatedRevisionId).toBeUndefined();
  });
});

describe("ValidateAdministrativeDocumentUseCase — mission §21 'révision exacte'", () => {
  it("pins the exact revisionId as validated", async () => {
    const document = baseDocument();
    const revision = draftRevision();
    revision.attachDocument({ documentId: "doc-ext-1", documentVersionId: "v1", documentChecksum: "abc", documentFileName: "f.pdf", documentMimeType: "application/pdf", occurredAt: NOW });
    revision.submitForReview(NOW);
    const documentRepository = inMemoryDocumentRepository([document]);
    const revisionRepository = inMemoryRevisionRepository([revision]);
    const useCase = new ValidateAdministrativeDocumentUseCase(fakeAccessService(), documentRepository, revisionRepository, fakeAuditLogWriter(), fakeStatusRecalculation(), fakeClock());

    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-2", actorRole: "OWNER", administrativeDocumentId: "doc-1", revisionId: revision.id });

    expect(summary.validatedRevisionId).toBe(revision.id);
    expect(summary.revisions[0]?.status).toBe("VALIDATED");
  });

  it("refuses to validate a revision with no attached file", async () => {
    const document = baseDocument();
    const revision = draftRevision();
    const documentRepository = inMemoryDocumentRepository([document]);
    const revisionRepository = inMemoryRevisionRepository([revision]);
    const useCase = new ValidateAdministrativeDocumentUseCase(fakeAccessService(), documentRepository, revisionRepository, fakeAuditLogWriter(), fakeStatusRecalculation(), fakeClock());

    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-2", actorRole: "OWNER", administrativeDocumentId: "doc-1", revisionId: revision.id })).rejects.toBeInstanceOf(
      AdministrativeDocumentNotReadyForValidationError,
    );
  });

  it("refuses to validate a DIFFERENT revision while one is already validated", async () => {
    const document = baseDocument();
    const validated = draftRevision({ revisionNumber: 1 });
    validated.attachDocument({ documentId: "doc-ext-1", documentVersionId: "v1", documentChecksum: "abc", documentFileName: "f.pdf", documentMimeType: "application/pdf", occurredAt: NOW });
    validated.submitForReview(NOW);
    validated.validate(NOW);
    document.markValidated({ revisionId: validated.id, validatedBy: "user-1", occurredAt: NOW });

    const other = draftRevision({ revisionNumber: 2 });
    other.attachDocument({ documentId: "doc-ext-2", documentVersionId: "v2", documentChecksum: "def", documentFileName: "g.pdf", documentMimeType: "application/pdf", occurredAt: NOW });
    other.submitForReview(NOW);

    const documentRepository = inMemoryDocumentRepository([document]);
    const revisionRepository = inMemoryRevisionRepository([validated, other]);
    const useCase = new ValidateAdministrativeDocumentUseCase(fakeAccessService(), documentRepository, revisionRepository, fakeAuditLogWriter(), fakeStatusRecalculation(), fakeClock());

    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-2", actorRole: "OWNER", administrativeDocumentId: "doc-1", revisionId: other.id })).rejects.toBeInstanceOf(
      AdministrativeDocumentAlreadyValidatedWithDifferentRevisionError,
    );
  });
});

describe("RejectAdministrativeDocumentUseCase", () => {
  it("rejects the specified revision without touching the document's validation", async () => {
    const document = baseDocument();
    const revision = draftRevision();
    revision.attachDocument({ documentId: "doc-ext-1", documentVersionId: "v1", documentChecksum: "abc", documentFileName: "f.pdf", documentMimeType: "application/pdf", occurredAt: NOW });
    revision.submitForReview(NOW);
    const documentRepository = inMemoryDocumentRepository([document]);
    const revisionRepository = inMemoryRevisionRepository([revision]);
    const statusRecalculation = fakeStatusRecalculation();
    const useCase = new RejectAdministrativeDocumentUseCase(fakeAccessService(), documentRepository, revisionRepository, fakeAuditLogWriter(), statusRecalculation, fakeClock());

    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-2", actorRole: "OWNER", administrativeDocumentId: "doc-1", revisionId: revision.id });

    expect(summary.revisions[0]?.status).toBe("REJECTED");
    expect(summary.validatedRevisionId).toBeUndefined();
    expect(statusRecalculation.recompute).toHaveBeenCalled();
  });
});
