import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeleteDocumentUseCase } from "../../../documents";
import type { GetTenderUseCase } from "../../../tenders";
import { DceDocumentNotFoundError, DceNotFoundError, DcePermissionMissingError, TenderArchivedForDceMutationError } from "../../domain/errors";
import { Dce } from "../../domain/dce.aggregate";
import { DceId } from "../../domain/dce-id.value-object";
import { DceDocument } from "../../domain/dce-document.entity";
import { InMemoryAuditLogWriter, InMemoryDceDocumentRepository, InMemoryDceRepository } from "../../test-support/fakes";
import { DeleteDceDocumentUseCase } from "./delete-dce-document.use-case";

function fakeGetTenderUseCase(overrides: Record<string, unknown> = {}): GetTenderUseCase {
  return {
    execute: vi.fn(async () => ({ id: "tender-1", organizationId: "org-1", ...overrides })),
  } as unknown as GetTenderUseCase;
}

function fakeDeleteDocumentUseCase(): DeleteDocumentUseCase {
  return { execute: vi.fn(async () => undefined) } as unknown as DeleteDocumentUseCase;
}

describe("DeleteDceDocumentUseCase", () => {
  let dceRepository: InMemoryDceRepository;
  let dceDocumentRepository: InMemoryDceDocumentRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let deleteDocumentUseCase: DeleteDocumentUseCase;

  beforeEach(async () => {
    dceRepository = new InMemoryDceRepository();
    dceDocumentRepository = new InMemoryDceDocumentRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    deleteDocumentUseCase = fakeDeleteDocumentUseCase();

    await dceRepository.seed(
      Dce.create({
        id: DceId.from("dce-1"),
        organizationId: "org-1",
        tenderId: "tender-1",
        createdByUserId: "user-1",
        occurredAt: new Date(),
      }),
    );
    await dceDocumentRepository.create(
      DceDocument.create({
        dceId: "dce-1",
        documentId: "document-1",
        organizationId: "org-1",
        createdByUserId: "user-1",
        occurredAt: new Date(),
      }),
    );
  });

  function buildUseCase(getTenderUseCase: GetTenderUseCase = fakeGetTenderUseCase()) {
    return new DeleteDceDocumentUseCase(
      dceRepository,
      dceDocumentRepository,
      auditLogWriter,
      getTenderUseCase,
      deleteDocumentUseCase,
    );
  }

  it("delegates to Documents' DeleteDocumentUseCase and records a DCE-specific audit entry", async () => {
    const useCase = buildUseCase();

    await useCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      documentId: "document-1",
      actorId: "user-1",
      actorRole: "ORGANIZATION_ADMIN",
    });

    expect(deleteDocumentUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", documentId: "document-1" }),
    );
    expect(auditLogWriter.entries[0]?.action).toBe("dce.document_deleted");
  });

  it("refuses when the actor lacks dce:delete (e.g. Contributor)", async () => {
    const useCase = buildUseCase();

    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        documentId: "document-1",
        actorId: "user-1",
        actorRole: "CONTRIBUTOR",
      }),
    ).rejects.toThrow(DcePermissionMissingError);
    expect(deleteDocumentUseCase.execute).not.toHaveBeenCalled();
  });

  it("throws DceDocumentNotFoundError when the document does not belong to this DCE", async () => {
    const useCase = buildUseCase();

    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        documentId: "not-in-this-dce",
        actorId: "user-1",
        actorRole: "ORGANIZATION_ADMIN",
      }),
    ).rejects.toThrow(DceDocumentNotFoundError);
  });

  it("throws DceNotFoundError when the tender has no DCE yet", async () => {
    const useCase = buildUseCase();

    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-without-dce",
        documentId: "document-1",
        actorId: "user-1",
        actorRole: "ORGANIZATION_ADMIN",
      }),
    ).rejects.toThrow(DceNotFoundError);
  });

  it("refuses to delete from an archived tender", async () => {
    const useCase = buildUseCase(fakeGetTenderUseCase({ archivedAt: "2026-07-27T00:00:00.000Z" }));

    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        documentId: "document-1",
        actorId: "user-1",
        actorRole: "ORGANIZATION_ADMIN",
      }),
    ).rejects.toThrow(TenderArchivedForDceMutationError);
  });
});
