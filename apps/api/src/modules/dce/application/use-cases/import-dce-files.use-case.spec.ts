import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateDocumentWithFirstVersionUseCase } from "../../../documents";
import type { GetTenderUseCase } from "../../../tenders";
import { DceNotFoundError, DcePermissionMissingError, TenderArchivedForDceMutationError, TooManyFilesError } from "../../domain/errors";
import { Dce } from "../../domain/dce.aggregate";
import { DceId } from "../../domain/dce-id.value-object";
import { DceStatus } from "../../domain/dce-status";
import {
  FakeFileSignatureDetector,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryDceDocumentRepository,
  InMemoryDceRepository,
  SequentialIdGenerator,
} from "../../test-support/fakes";
import { ImportDceFilesUseCase, type IncomingDceUpload } from "./import-dce-files.use-case";

const PDF_BYTES = Buffer.from("%PDF-1.7 fake content");

function fakeGetTenderUseCase(overrides: Record<string, unknown> = {}): GetTenderUseCase {
  return {
    execute: vi.fn(async () => ({ id: "tender-1", organizationId: "org-1", ...overrides })),
  } as unknown as GetTenderUseCase;
}

/**
 * Simule ce que ferait réellement CreateDocumentWithFirstVersionUseCase (créer un Document +
 * DocumentVersion en base) en peuplant directement la carte `documentVersions` du fake
 * DceDocumentRepository — nécessaire pour que `findActiveByChecksum` (détection de doublon,
 * jointure réelle en production) trouve quelque chose dans ces tests.
 */
function fakeCreateDocumentUseCase(dceDocumentRepository: InMemoryDceDocumentRepository): CreateDocumentWithFirstVersionUseCase {
  let counter = 0;
  return {
    execute: vi.fn(async (command: { title: string; file: { buffer: Buffer; originalFilename: string; mimeType: string } }) => {
      counter += 1;
      const documentId = `document-${counter}`;
      const checksum = createHash("sha256").update(command.file.buffer).digest("hex");
      const extension = /\.([a-zA-Z0-9]+)$/.exec(command.file.originalFilename)?.[1]?.toLowerCase() ?? "";
      dceDocumentRepository.documentVersions.set(documentId, {
        originalFilename: command.file.originalFilename,
        sanitizedFilename: command.title,
        mimeType: command.file.mimeType,
        extension,
        sizeBytes: command.file.buffer.length,
        checksum,
        currentVersionNumber: 1,
      });
      return { id: documentId, title: command.title, currentVersionNumber: 1 };
    }),
  } as unknown as CreateDocumentWithFirstVersionUseCase;
}

describe("ImportDceFilesUseCase", () => {
  let dceRepository: InMemoryDceRepository;
  let dceDocumentRepository: InMemoryDceDocumentRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let createDocumentUseCase: CreateDocumentWithFirstVersionUseCase;

  beforeEach(async () => {
    dceRepository = new InMemoryDceRepository();
    dceDocumentRepository = new InMemoryDceDocumentRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    createDocumentUseCase = fakeCreateDocumentUseCase(dceDocumentRepository);

    await dceRepository.seed(
      Dce.create({
        id: DceId.from("dce-1"),
        organizationId: "org-1",
        tenderId: "tender-1",
        createdByUserId: "user-1",
        occurredAt: new Date(),
      }),
    );
  });

  function buildUseCase(getTenderUseCase: GetTenderUseCase = fakeGetTenderUseCase()) {
    return new ImportDceFilesUseCase(
      dceRepository,
      dceDocumentRepository,
      new FakeFileSignatureDetector(null),
      auditLogWriter,
      new FixedClock(),
      new SequentialIdGenerator(),
      getTenderUseCase,
      createDocumentUseCase,
    );
  }

  function baseCommand(files: readonly IncomingDceUpload[]) {
    return {
      organizationId: "org-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "CONTRIBUTOR",
      files,
      maxFileSizeBytes: 10 * 1024 * 1024,
      maxFilesPerImport: 20,
    };
  }

  it("imports a single valid PDF file and marks the DCE as IMPORTED", async () => {
    const useCase = buildUseCase();

    const result = await useCase.execute(
      baseCommand([{ buffer: PDF_BYTES, originalFilename: "cctp.pdf", mimeType: "application/pdf" }]),
    );

    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
    expect(auditLogWriter.entries.map((entry) => entry.action)).toEqual(["dce.document_imported"]);

    const dce = await dceRepository.findByTenderId({ organizationId: "org-1", tenderId: "tender-1" });
    expect(dce?.status).toBe(DceStatus.Imported);
  });

  it("imports multiple valid files in one call", async () => {
    const useCase = buildUseCase();

    const result = await useCase.execute(
      baseCommand([
        { buffer: PDF_BYTES, originalFilename: "cctp.pdf", mimeType: "application/pdf" },
        { buffer: Buffer.from("png bytes"), originalFilename: "plan.png", mimeType: "image/png" },
      ]),
    );

    expect(result.accepted).toHaveLength(2);
  });

  it("rejects an unsupported format per-file without failing the rest of the batch", async () => {
    const useCase = buildUseCase();

    const result = await useCase.execute(
      baseCommand([
        { buffer: PDF_BYTES, originalFilename: "cctp.pdf", mimeType: "application/pdf" },
        { buffer: Buffer.from("exe bytes"), originalFilename: "virus.exe", mimeType: "application/x-msdownload" },
      ]),
    );

    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.originalFilename).toBe("virus.exe");
  });

  it("rejects a .zip file, redirecting to the archive import", async () => {
    const useCase = buildUseCase();

    const result = await useCase.execute(
      baseCommand([{ buffer: Buffer.from("PK.."), originalFilename: "archive.zip", mimeType: "application/zip" }]),
    );

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0]?.reason).toMatch(/archive import/);
  });

  it("rejects a duplicate file by content hash", async () => {
    const useCase = buildUseCase();
    await useCase.execute(baseCommand([{ buffer: PDF_BYTES, originalFilename: "cctp.pdf", mimeType: "application/pdf" }]));

    const result = await useCase.execute(
      baseCommand([{ buffer: PDF_BYTES, originalFilename: "cctp-copy.pdf", mimeType: "application/pdf" }]),
    );

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0]?.reason).toMatch(/duplicate/);
  });

  it("rejects a file whose content does not match its declared extension (disguised file)", async () => {
    const dceRepositoryLocal = dceRepository;
    const useCase = new ImportDceFilesUseCase(
      dceRepositoryLocal,
      dceDocumentRepository,
      new FakeFileSignatureDetector({ mimeType: "image/jpeg" }),
      auditLogWriter,
      new FixedClock(),
      new SequentialIdGenerator(),
      fakeGetTenderUseCase(),
      createDocumentUseCase,
    );

    const result = await useCase.execute(
      baseCommand([{ buffer: Buffer.from("jpeg-bytes-disguised"), originalFilename: "cctp.pdf", mimeType: "application/pdf" }]),
    );

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0]?.reason).toMatch(/does not match/);
  });

  it("throws TooManyFilesError when the batch exceeds maxFilesPerImport", async () => {
    const useCase = buildUseCase();
    const files = Array.from({ length: 3 }, (_, index) => ({
      buffer: PDF_BYTES,
      originalFilename: `file-${index}.pdf`,
      mimeType: "application/pdf",
    }));

    await expect(useCase.execute({ ...baseCommand(files), maxFilesPerImport: 2 })).rejects.toThrow(TooManyFilesError);
  });

  it("throws DceNotFoundError when the tender has no DCE yet", async () => {
    const emptyDceRepository = new InMemoryDceRepository();
    const useCase = new ImportDceFilesUseCase(
      emptyDceRepository,
      dceDocumentRepository,
      new FakeFileSignatureDetector(null),
      auditLogWriter,
      new FixedClock(),
      new SequentialIdGenerator(),
      fakeGetTenderUseCase(),
      createDocumentUseCase,
    );

    await expect(
      useCase.execute(baseCommand([{ buffer: PDF_BYTES, originalFilename: "cctp.pdf", mimeType: "application/pdf" }])),
    ).rejects.toThrow(DceNotFoundError);
  });

  it("refuses when the actor lacks dce:import (read-only role)", async () => {
    const useCase = buildUseCase();

    await expect(
      useCase.execute({
        ...baseCommand([{ buffer: PDF_BYTES, originalFilename: "cctp.pdf", mimeType: "application/pdf" }]),
        actorRole: "READ_ONLY",
      }),
    ).rejects.toThrow(DcePermissionMissingError);
  });

  it("refuses to import into an archived tender", async () => {
    const useCase = buildUseCase(fakeGetTenderUseCase({ archivedAt: "2026-07-27T00:00:00.000Z" }));

    await expect(
      useCase.execute(baseCommand([{ buffer: PDF_BYTES, originalFilename: "cctp.pdf", mimeType: "application/pdf" }])),
    ).rejects.toThrow(TenderArchivedForDceMutationError);
  });
});
