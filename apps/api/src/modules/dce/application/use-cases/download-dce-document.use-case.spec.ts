import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DownloadDocumentVersionUseCase } from "../../../documents";
import type { GetTenderUseCase } from "../../../tenders";
import { DceDocumentNotFoundError, DceNotFoundError } from "../../domain/errors";
import { DceDocumentCategory } from "../../domain/dce-document-category";
import { Dce } from "../../domain/dce.aggregate";
import { DceId } from "../../domain/dce-id.value-object";
import { DceDocument } from "../../domain/dce-document.entity";
import { InMemoryDceDocumentRepository, InMemoryDceRepository } from "../../test-support/fakes";
import { DownloadDceDocumentUseCase } from "./download-dce-document.use-case";

function fakeDownloadDocumentVersionUseCase(): DownloadDocumentVersionUseCase {
  return {
    execute: vi.fn(async () => ({
      kind: "stream",
      stream: null,
      contentType: "application/pdf",
      filename: "cctp.pdf",
      sizeBytes: 100,
    })),
  } as unknown as DownloadDocumentVersionUseCase;
}

function fakeGetTenderUseCase(): GetTenderUseCase {
  return { execute: vi.fn(async () => ({ id: "tender-1", organizationId: "org-1", clientAccountId: "client-1" })) } as unknown as GetTenderUseCase;
}

describe("DownloadDceDocumentUseCase", () => {
  let dceRepository: InMemoryDceRepository;
  let dceDocumentRepository: InMemoryDceDocumentRepository;
  let getTenderUseCase: GetTenderUseCase;
  let downloadDocumentVersionUseCase: DownloadDocumentVersionUseCase;
  let useCase: DownloadDceDocumentUseCase;

  beforeEach(async () => {
    dceRepository = new InMemoryDceRepository();
    dceDocumentRepository = new InMemoryDceDocumentRepository();
    getTenderUseCase = fakeGetTenderUseCase();
    downloadDocumentVersionUseCase = fakeDownloadDocumentVersionUseCase();
    useCase = new DownloadDceDocumentUseCase(dceRepository, dceDocumentRepository, getTenderUseCase, downloadDocumentVersionUseCase);

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
        category: DceDocumentCategory.Other,
        occurredAt: new Date(),
      }),
    );
  });

  it("delegates to Documents' DownloadDocumentVersionUseCase once the document is confirmed to belong to this DCE", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      documentId: "document-1",
      actorId: "user-1",
      actorRole: "READ_ONLY",
    });

    expect(result.kind).toBe("stream");
    expect(result.kind === "stream" ? result.filename : undefined).toBe("cctp.pdf");
    expect(downloadDocumentVersionUseCase.execute).toHaveBeenCalledWith({
      organizationId: "org-1",
      documentId: "document-1",
      actorRole: "READ_ONLY",
    });
  });

  it("refuses to download a document that does not belong to this Tender's DCE, even if it exists in the same organization", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        documentId: "document-from-another-tender",
        actorId: "user-1",
        actorRole: "READ_ONLY",
      }),
    ).rejects.toThrow(DceDocumentNotFoundError);
    expect(downloadDocumentVersionUseCase.execute).not.toHaveBeenCalled();
  });

  it("throws DceNotFoundError when the tender has no DCE yet", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-without-dce",
        documentId: "document-1",
        actorId: "user-1",
        actorRole: "READ_ONLY",
      }),
    ).rejects.toThrow(DceNotFoundError);
  });

  // Mission Sprint 8A.2 (audit isolation inter-client) — régression : `GetTenderUseCase` doit
  // recevoir `actorId`, sinon l'affectation client de l'acteur n'est jamais vérifiée.
  it("regression guard — always calls GetTenderUseCase with actorId, never omitted (isolation inter-client)", async () => {
    await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", documentId: "document-1", actorId: "user-42", actorRole: "READ_ONLY" });

    expect(getTenderUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ actorId: "user-42" }));
  });
});
