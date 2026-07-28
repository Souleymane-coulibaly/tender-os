import { beforeEach, describe, expect, it } from "vitest";
import { DceNotFoundError, DcePermissionMissingError } from "../../domain/errors";
import { DceDocumentCategory } from "../../domain/dce-document-category";
import { Dce } from "../../domain/dce.aggregate";
import { DceId } from "../../domain/dce-id.value-object";
import { DceDocument } from "../../domain/dce-document.entity";
import { InMemoryDceDocumentRepository, InMemoryDceRepository } from "../../test-support/fakes";
import { ListDceDocumentsUseCase } from "./list-dce-documents.use-case";

describe("ListDceDocumentsUseCase", () => {
  let dceRepository: InMemoryDceRepository;
  let dceDocumentRepository: InMemoryDceDocumentRepository;
  let useCase: ListDceDocumentsUseCase;

  beforeEach(async () => {
    dceRepository = new InMemoryDceRepository();
    dceDocumentRepository = new InMemoryDceDocumentRepository();
    useCase = new ListDceDocumentsUseCase(dceRepository, dceDocumentRepository);

    await dceRepository.seed(
      Dce.create({
        id: DceId.from("dce-1"),
        organizationId: "org-1",
        tenderId: "tender-1",
        createdByUserId: "user-1",
        occurredAt: new Date(),
      }),
    );
    dceDocumentRepository.documentVersions.set("document-1", {
      originalFilename: "cctp.pdf",
      sanitizedFilename: "cctp.pdf",
      mimeType: "application/pdf",
      extension: "pdf",
      sizeBytes: 100,
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
        occurredAt: new Date(),
      }),
    );
  });

  it("lists the files of a tender's DCE", async () => {
    const result = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorRole: "READ_ONLY" });

    expect(result).toHaveLength(1);
    expect(result[0]?.originalFilename).toBe("cctp.pdf");
  });

  it("throws DceNotFoundError when the tender has no DCE yet", async () => {
    await expect(
      useCase.execute({ organizationId: "org-1", tenderId: "tender-without-dce", actorRole: "READ_ONLY" }),
    ).rejects.toThrow(DceNotFoundError);
  });

  it("refuses when the actor lacks dce:read", async () => {
    await expect(
      useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorRole: "SOME_UNKNOWN_ROLE" }),
    ).rejects.toThrow(DcePermissionMissingError);
  });
});
