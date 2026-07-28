import { beforeEach, describe, expect, it } from "vitest";
import { DceDocumentNotFoundError, DceNotFoundError } from "../../domain/errors";
import { DceDocumentCategory } from "../../domain/dce-document-category";
import { Dce } from "../../domain/dce.aggregate";
import { DceId } from "../../domain/dce-id.value-object";
import { DceDocument } from "../../domain/dce-document.entity";
import { InMemoryDceDocumentRepository, InMemoryDceRepository } from "../../test-support/fakes";
import { GetDceDocumentUseCase } from "./get-dce-document.use-case";

describe("GetDceDocumentUseCase", () => {
  let dceRepository: InMemoryDceRepository;
  let dceDocumentRepository: InMemoryDceDocumentRepository;
  let useCase: GetDceDocumentUseCase;

  beforeEach(async () => {
    dceRepository = new InMemoryDceRepository();
    dceDocumentRepository = new InMemoryDceDocumentRepository();
    useCase = new GetDceDocumentUseCase(dceRepository, dceDocumentRepository);

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

  it("returns a single file's metadata", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      documentId: "document-1",
      actorRole: "READ_ONLY",
    });

    expect(result.originalFilename).toBe("cctp.pdf");
  });

  it("throws DceDocumentNotFoundError when the document does not belong to this DCE", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        documentId: "some-other-document",
        actorRole: "READ_ONLY",
      }),
    ).rejects.toThrow(DceDocumentNotFoundError);
  });

  it("throws DceNotFoundError when the tender has no DCE yet", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-without-dce",
        documentId: "document-1",
        actorRole: "READ_ONLY",
      }),
    ).rejects.toThrow(DceNotFoundError);
  });
});
