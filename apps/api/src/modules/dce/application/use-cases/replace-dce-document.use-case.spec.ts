import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AddDocumentVersionUseCase } from "../../../documents";
import type { GetTenderUseCase } from "../../../tenders";
import { DceDocumentNotFoundError, DceNotFoundError, DcePermissionMissingError, UnsupportedFileTypeError } from "../../domain/errors";
import { DceDocumentCategory } from "../../domain/dce-document-category";
import { Dce } from "../../domain/dce.aggregate";
import { DceId } from "../../domain/dce-id.value-object";
import { DceDocument } from "../../domain/dce-document.entity";
import { FakeFileSignatureDetector, InMemoryAuditLogWriter, InMemoryDceDocumentRepository, InMemoryDceRepository } from "../../test-support/fakes";
import { ReplaceDceDocumentUseCase } from "./replace-dce-document.use-case";

const PDF_BYTES = Buffer.from("%PDF-1.7 fake content v2");

function fakeGetTenderUseCase(): GetTenderUseCase {
  return { execute: vi.fn(async () => ({ id: "tender-1", organizationId: "org-1" })) } as unknown as GetTenderUseCase;
}

function fakeAddDocumentVersionUseCase(): AddDocumentVersionUseCase {
  return { execute: vi.fn(async () => ({ id: "document-1", currentVersionNumber: 2 })) } as unknown as AddDocumentVersionUseCase;
}

describe("ReplaceDceDocumentUseCase", () => {
  let dceRepository: InMemoryDceRepository;
  let dceDocumentRepository: InMemoryDceDocumentRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let addDocumentVersionUseCase: AddDocumentVersionUseCase;

  beforeEach(async () => {
    dceRepository = new InMemoryDceRepository();
    dceDocumentRepository = new InMemoryDceDocumentRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    addDocumentVersionUseCase = fakeAddDocumentVersionUseCase();

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
      originalFilename: "cctp-v2.pdf",
      sanitizedFilename: "cctp-v2.pdf",
      mimeType: "application/pdf",
      extension: "pdf",
      sizeBytes: PDF_BYTES.length,
      checksum: "hash-v2",
      currentVersionNumber: 2,
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

  function buildUseCase(signatureDetector = new FakeFileSignatureDetector(null)) {
    return new ReplaceDceDocumentUseCase(
      dceRepository,
      dceDocumentRepository,
      signatureDetector,
      auditLogWriter,
      fakeGetTenderUseCase(),
      addDocumentVersionUseCase,
    );
  }

  function baseCommand() {
    return {
      organizationId: "org-1",
      tenderId: "tender-1",
      documentId: "document-1",
      actorId: "user-1",
      actorRole: "CONTRIBUTOR",
      file: { buffer: PDF_BYTES, originalFilename: "cctp-v2.pdf", mimeType: "application/pdf" },
      maxFileSizeBytes: 10 * 1024 * 1024,
    };
  }

  it("delegates to Documents' AddDocumentVersionUseCase, preserving version history, and records an audit entry", async () => {
    const useCase = buildUseCase();

    const result = await useCase.execute(baseCommand());

    expect(addDocumentVersionUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", documentId: "document-1" }),
    );
    expect(result.currentVersionNumber).toBe(2);
    expect(auditLogWriter.entries[0]?.action).toBe("dce.document_replaced");
  });

  it("TEST 4 (Checkpoint 2.1-P2.1-FIX-A) — replacing a document advances the DCE revision (semantic content change)", async () => {
    const useCase = buildUseCase();
    const before = await dceRepository.findById({ organizationId: "org-1", dceId: "dce-1" });

    await useCase.execute(baseCommand());

    const after = await dceRepository.findById({ organizationId: "org-1", dceId: "dce-1" });
    expect(after!.revision).toBe(before!.revision + 1);
  });

  it("BLOQUANT (correctif audit — P1 'incrément best-effort masque un vrai changement') — if incrementRevision itself fails, the replace ABORTS before touching Documents at all (clean, retry-safe — never a silent CURRENT masking a real change)", async () => {
    const failingIncrement = vi.spyOn(dceRepository, "incrementRevision").mockRejectedValueOnce(new Error("simulated DB failure"));
    const useCase = buildUseCase();

    await expect(useCase.execute(baseCommand())).rejects.toThrow("simulated DB failure");

    expect(failingIncrement).toHaveBeenCalledTimes(1);
    expect(addDocumentVersionUseCase.execute).not.toHaveBeenCalled();
  });

  it("if the underlying Documents replace fails AFTER the revision already advanced, the failure direction is safe: revision stays advanced (false STALE), never reverted to a false CURRENT", async () => {
    const before = await dceRepository.findById({ organizationId: "org-1", dceId: "dce-1" });
    const failingAdd = { execute: vi.fn(async () => { throw new Error("simulated storage failure"); }) } as unknown as AddDocumentVersionUseCase;
    const useCase = new ReplaceDceDocumentUseCase(
      dceRepository,
      dceDocumentRepository,
      new FakeFileSignatureDetector(null),
      auditLogWriter,
      fakeGetTenderUseCase(),
      failingAdd,
    );

    await expect(useCase.execute(baseCommand())).rejects.toThrow("simulated storage failure");

    const after = await dceRepository.findById({ organizationId: "org-1", dceId: "dce-1" });
    expect(after!.revision).toBe(before!.revision + 1);
  });

  it("refuses when the actor lacks dce:replace (read-only role)", async () => {
    const useCase = buildUseCase();

    await expect(useCase.execute({ ...baseCommand(), actorRole: "READ_ONLY" })).rejects.toThrow(
      DcePermissionMissingError,
    );
    expect(addDocumentVersionUseCase.execute).not.toHaveBeenCalled();
  });

  it("rejects a replacement whose content does not match its declared extension", async () => {
    const useCase = buildUseCase(new FakeFileSignatureDetector({ mimeType: "image/jpeg" }));

    await expect(useCase.execute(baseCommand())).rejects.toThrow(UnsupportedFileTypeError);
    expect(addDocumentVersionUseCase.execute).not.toHaveBeenCalled();
  });

  it("throws DceDocumentNotFoundError when the document does not belong to this DCE", async () => {
    const useCase = buildUseCase();

    await expect(useCase.execute({ ...baseCommand(), documentId: "not-in-this-dce" })).rejects.toThrow(
      DceDocumentNotFoundError,
    );
  });

  it("throws DceNotFoundError when the tender has no DCE yet", async () => {
    const emptyDceRepository = new InMemoryDceRepository();
    const useCase = new ReplaceDceDocumentUseCase(
      emptyDceRepository,
      dceDocumentRepository,
      new FakeFileSignatureDetector(null),
      auditLogWriter,
      fakeGetTenderUseCase(),
      addDocumentVersionUseCase,
    );

    await expect(useCase.execute(baseCommand())).rejects.toThrow(DceNotFoundError);
  });
});
