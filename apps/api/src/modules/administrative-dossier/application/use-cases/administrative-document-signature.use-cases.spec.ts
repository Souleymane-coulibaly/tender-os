import { describe, expect, it, vi } from "vitest";
import { RecordAdministrativeDocumentSignatureUseCase, RejectAdministrativeDocumentSignatureUseCase, SetAdministrativeDocumentSignatureModeUseCase } from "./administrative-document-signature.use-cases";
import type { AdministrativeDocumentRepository } from "../ports/administrative-document.repository";
import type { AdministrativeDocumentRevisionRepository } from "../ports/administrative-document-revision.repository";
import type { AuditLogWriter } from "../ports/audit-log-writer";
import type { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import { AdministrativeDocumentType } from "../../domain/administrative-document-type";
import { AdministrativeDocument } from "../../domain/administrative-document.aggregate";
import { AdministrativeSignatureMode, AdministrativeSignatureStatus } from "../../domain/administrative-signature";
import { AdministrativeSignatureNotRequiredError } from "../../domain/errors";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";
const DOSSIER_ID = "dossier-1";

function fakeClock() {
  return { now: () => NOW };
}
function fakeAccessService(): AdministrativeDossierAccessService {
  return { assertTenderAccess: vi.fn(async () => "client-1") } as unknown as AdministrativeDossierAccessService;
}
function fakeAuditLogWriter(): AuditLogWriter {
  return { record: vi.fn(async () => {}) };
}
function fakeRevisionRepository(): AdministrativeDocumentRevisionRepository {
  return { create: async () => {}, findById: async () => null, listByDocument: async () => [], save: async () => {} };
}
function fakeDocument(): AdministrativeDocument {
  return AdministrativeDocument.create({ id: "doc-1", organizationId: ORGANIZATION_ID, administrativeDossierId: DOSSIER_ID, tenderId: TENDER_ID, documentType: AdministrativeDocumentType.ActeEngagement, label: "Acte d'engagement", createdBy: "user-1", occurredAt: NOW });
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

describe("SetAdministrativeDocumentSignatureModeUseCase — mission §18 'jamais un PENDING auto-créé'", () => {
  it("setting a required mode moves the status to PENDING", async () => {
    const document = fakeDocument();
    const repository = inMemoryDocumentRepository([document]);
    const useCase = new SetAdministrativeDocumentSignatureModeUseCase(fakeAccessService(), repository, fakeRevisionRepository(), fakeClock());

    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", administrativeDocumentId: "doc-1", mode: AdministrativeSignatureMode.Manual });

    expect(summary.signatureMode).toBe("MANUAL");
    expect(summary.signatureStatus).toBe("PENDING");
  });

  it("setting NOT_REQUIRED never leaves a PENDING status behind", async () => {
    const document = fakeDocument();
    document.setSignatureMode({ mode: AdministrativeSignatureMode.Manual, occurredAt: NOW });
    const repository = inMemoryDocumentRepository([document]);
    const useCase = new SetAdministrativeDocumentSignatureModeUseCase(fakeAccessService(), repository, fakeRevisionRepository(), fakeClock());

    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", administrativeDocumentId: "doc-1", mode: AdministrativeSignatureMode.NotRequired });

    expect(summary.signatureStatus).toBe("NOT_REQUIRED");
  });
});

describe("RecordAdministrativeDocumentSignatureUseCase", () => {
  it("dispatches to manual signature recording and writes an audit log entry", async () => {
    const document = fakeDocument();
    document.setSignatureMode({ mode: AdministrativeSignatureMode.Manual, occurredAt: NOW });
    const repository = inMemoryDocumentRepository([document]);
    const auditLogWriter = fakeAuditLogWriter();
    const useCase = new RecordAdministrativeDocumentSignatureUseCase(fakeAccessService(), repository, fakeRevisionRepository(), auditLogWriter, fakeClock());

    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", administrativeDocumentId: "doc-1" });

    expect(summary.signatureStatus).toBe("SIGNED");
    expect(auditLogWriter.record).toHaveBeenCalledWith(expect.objectContaining({ action: "ADMINISTRATIVE_DOCUMENT_SIGNATURE_RECORDED" }));
  });

  it("refuses to record a signature when none is required", async () => {
    const document = fakeDocument();
    const repository = inMemoryDocumentRepository([document]);
    const useCase = new RecordAdministrativeDocumentSignatureUseCase(fakeAccessService(), repository, fakeRevisionRepository(), fakeAuditLogWriter(), fakeClock());

    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", administrativeDocumentId: "doc-1" })).rejects.toBeInstanceOf(AdministrativeSignatureNotRequiredError);
  });
});

describe("RejectAdministrativeDocumentSignatureUseCase", () => {
  it("rejects a pending signature", async () => {
    const document = fakeDocument();
    document.setSignatureMode({ mode: AdministrativeSignatureMode.External, occurredAt: NOW });
    const repository = inMemoryDocumentRepository([document]);
    const useCase = new RejectAdministrativeDocumentSignatureUseCase(fakeAccessService(), repository, fakeRevisionRepository(), fakeClock());

    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "validator-1", actorRole: "OWNER", administrativeDocumentId: "doc-1" });

    expect(summary.signatureStatus).toBe(AdministrativeSignatureStatus.Rejected);
  });
});
