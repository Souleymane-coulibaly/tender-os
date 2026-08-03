import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GetTenderUseCase } from "../../../tenders";
import { DceNotFoundError, DcePermissionMissingError } from "../../domain/errors";
import { DceDocumentCategory } from "../../domain/dce-document-category";
import { Dce } from "../../domain/dce.aggregate";
import { DceId } from "../../domain/dce-id.value-object";
import { DceDocument } from "../../domain/dce-document.entity";
import { InMemoryDceDocumentRepository, InMemoryDceRepository } from "../../test-support/fakes";
import { ListDceDocumentsUseCase } from "./list-dce-documents.use-case";

function fakeGetTenderUseCase(): GetTenderUseCase {
  return { execute: vi.fn(async () => ({ id: "tender-1", organizationId: "org-1", clientAccountId: "client-1" })) } as unknown as GetTenderUseCase;
}

describe("ListDceDocumentsUseCase", () => {
  let dceRepository: InMemoryDceRepository;
  let dceDocumentRepository: InMemoryDceDocumentRepository;
  let getTenderUseCase: GetTenderUseCase;
  let useCase: ListDceDocumentsUseCase;

  beforeEach(async () => {
    dceRepository = new InMemoryDceRepository();
    dceDocumentRepository = new InMemoryDceDocumentRepository();
    getTenderUseCase = fakeGetTenderUseCase();
    useCase = new ListDceDocumentsUseCase(dceRepository, dceDocumentRepository, getTenderUseCase);

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
    const result = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorId: "user-1", actorRole: "READ_ONLY" });

    expect(result).toHaveLength(1);
    expect(result[0]?.originalFilename).toBe("cctp.pdf");
  });

  it("throws DceNotFoundError when the tender has no DCE yet", async () => {
    await expect(
      useCase.execute({ organizationId: "org-1", tenderId: "tender-without-dce", actorId: "user-1", actorRole: "READ_ONLY" }),
    ).rejects.toThrow(DceNotFoundError);
  });

  it("refuses when the actor lacks dce:read", async () => {
    await expect(
      useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorId: "user-1", actorRole: "SOME_UNKNOWN_ROLE" }),
    ).rejects.toThrow(DcePermissionMissingError);
  });

  // Mission Sprint 8A.2 (audit isolation inter-client) — régression : `GetTenderUseCase` doit
  // recevoir `actorId`, sinon l'affectation client de l'acteur n'est jamais vérifiée.
  it("regression guard — always calls GetTenderUseCase with actorId, never omitted (isolation inter-client)", async () => {
    await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorId: "user-42", actorRole: "READ_ONLY" });

    expect(getTenderUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ actorId: "user-42" }));
  });
});
