import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GetTenderUseCase } from "../../../tenders";
import { FixedClock, InMemoryAuditLogWriter, InMemoryDceDocumentRepository, InMemoryDceRepository } from "../../test-support/fakes";
import { DceDocument } from "../../domain/dce-document.entity";
import { DceDocumentCategory } from "../../domain/dce-document-category";
import { DceId } from "../../domain/dce-id.value-object";
import { Dce } from "../../domain/dce.aggregate";
import { DceDocumentNotFoundError, DceNotFoundError, DcePermissionMissingError } from "../../domain/errors";
import { CorrectDceDocumentCategoryUseCase } from "./correct-dce-document-category.use-case";

function fakeGetTenderUseCase(): GetTenderUseCase {
  return { execute: vi.fn(async () => ({ id: "tender-1", organizationId: "org-1" })) } as unknown as GetTenderUseCase;
}

describe("CorrectDceDocumentCategoryUseCase", () => {
  let dceRepository: InMemoryDceRepository;
  let dceDocumentRepository: InMemoryDceDocumentRepository;
  let auditLogWriter: InMemoryAuditLogWriter;

  beforeEach(async () => {
    dceRepository = new InMemoryDceRepository();
    dceDocumentRepository = new InMemoryDceDocumentRepository();
    auditLogWriter = new InMemoryAuditLogWriter();

    await dceRepository.seed(
      Dce.create({ id: DceId.from("dce-1"), organizationId: "org-1", tenderId: "tender-1", createdByUserId: "user-1", occurredAt: new Date() }),
    );
    dceDocumentRepository.documentVersions.set("document-1", {
      originalFilename: "cctp.pdf",
      sanitizedFilename: "cctp.pdf",
      mimeType: "application/pdf",
      extension: "pdf",
      sizeBytes: 1000,
      checksum: "hash-1",
      currentVersionNumber: 1,
    });
    await dceDocumentRepository.create(
      DceDocument.create({
        dceId: "dce-1",
        documentId: "document-1",
        organizationId: "org-1",
        createdByUserId: "user-1",
        category: DceDocumentCategory.Other,
        occurredAt: new Date("2026-08-01T00:00:00Z"),
      }),
    );
  });

  function buildUseCase(): CorrectDceDocumentCategoryUseCase {
    return new CorrectDceDocumentCategoryUseCase(dceRepository, dceDocumentRepository, auditLogWriter, new FixedClock(), fakeGetTenderUseCase());
  }

  function baseCommand() {
    return {
      organizationId: "org-1",
      tenderId: "tender-1",
      documentId: "document-1",
      actorId: "user-1",
      actorRole: "CONTRIBUTOR",
      category: DceDocumentCategory.Technical,
    };
  }

  it("corrects the category and records the previous/new value in the AuditLog", async () => {
    const useCase = buildUseCase();
    const result = await useCase.execute({ ...baseCommand(), reason: "Ce fichier est en réalité le CCTP." });

    expect(result.category).toBe(DceDocumentCategory.Technical);
    expect(auditLogWriter.entries).toHaveLength(1);
    expect(auditLogWriter.entries[0]).toMatchObject({
      action: "dce.document_category_corrected",
      resourceType: "dce_document",
      resourceId: "document-1",
      metadata: { previousCategory: DceDocumentCategory.Other, newCategory: DceDocumentCategory.Technical, reason: "Ce fichier est en réalité le CCTP." },
    });

    const link = await dceDocumentRepository.findByDceIdAndDocumentId({ organizationId: "org-1", dceId: "dce-1", documentId: "document-1" });
    expect(link?.category).toBe(DceDocumentCategory.Technical);
  });

  it("never overwrites history: the previous category remains readable in the audit trail across two corrections", async () => {
    const useCase = buildUseCase();
    await useCase.execute(baseCommand());
    await useCase.execute({ ...baseCommand(), category: DceDocumentCategory.Financial });

    expect(auditLogWriter.entries).toHaveLength(2);
    expect(auditLogWriter.entries[0]?.metadata).toMatchObject({ previousCategory: DceDocumentCategory.Other, newCategory: DceDocumentCategory.Technical });
    expect(auditLogWriter.entries[1]?.metadata).toMatchObject({ previousCategory: DceDocumentCategory.Technical, newCategory: DceDocumentCategory.Financial });
  });

  it("is a no-op (idempotent, no audit entry) when the corrected category is the same as the current one", async () => {
    const useCase = buildUseCase();
    await useCase.execute({ ...baseCommand(), category: DceDocumentCategory.Other });

    expect(auditLogWriter.entries).toHaveLength(0);
  });

  it("refuses a READ_ONLY actor (missing dce:replace)", async () => {
    const useCase = buildUseCase();
    await expect(useCase.execute({ ...baseCommand(), actorRole: "READ_ONLY" })).rejects.toThrow(DcePermissionMissingError);
    expect(auditLogWriter.entries).toHaveLength(0);
  });

  it("throws DceDocumentNotFoundError when the document does not belong to this DCE", async () => {
    const useCase = buildUseCase();
    await expect(useCase.execute({ ...baseCommand(), documentId: "not-in-this-dce" })).rejects.toThrow(DceDocumentNotFoundError);
  });

  it("throws DceNotFoundError when the tender has no DCE yet", async () => {
    const useCase = new CorrectDceDocumentCategoryUseCase(new InMemoryDceRepository(), dceDocumentRepository, auditLogWriter, new FixedClock(), fakeGetTenderUseCase());
    await expect(useCase.execute(baseCommand())).rejects.toThrow(DceNotFoundError);
  });
});
