import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateDocumentWithFirstVersionUseCase, InternalDocumentCleanupService } from "../../../documents";
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
      const versionId = `document-${counter}-version-1`;
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
        currentVersionId: versionId,
      });
      return { id: documentId, title: command.title, currentVersionNumber: 1, currentVersion: { id: versionId } };
    }),
  } as unknown as CreateDocumentWithFirstVersionUseCase;
}

function fakeInternalDocumentCleanupService(overrides?: {
  purgeJustCreatedDocument?: ReturnType<typeof vi.fn>;
}): InternalDocumentCleanupService {
  return {
    purgeJustCreatedDocument: overrides?.purgeJustCreatedDocument ?? vi.fn().mockResolvedValue(undefined),
  } as unknown as InternalDocumentCleanupService;
}

describe("ImportDceFilesUseCase", () => {
  let dceRepository: InMemoryDceRepository;
  let dceDocumentRepository: InMemoryDceDocumentRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let createDocumentUseCase: CreateDocumentWithFirstVersionUseCase;
  let internalDocumentCleanupService: InternalDocumentCleanupService;

  beforeEach(async () => {
    dceRepository = new InMemoryDceRepository();
    dceDocumentRepository = new InMemoryDceDocumentRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    createDocumentUseCase = fakeCreateDocumentUseCase(dceDocumentRepository);
    internalDocumentCleanupService = fakeInternalDocumentCleanupService();

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
      internalDocumentCleanupService,
      { canOperateOnTender: vi.fn(async () => true), runTenderOperationEntitled: vi.fn(async (_i: unknown, op: () => Promise<unknown>) => op()) } as never,
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

  it("TEST 3 (Checkpoint 2.1-P2.1-FIX-A) — the DCE revision advances once per accepted file, never for a rejected duplicate", async () => {
    const useCase = buildUseCase();
    const before = await dceRepository.findByTenderId({ organizationId: "org-1", tenderId: "tender-1" });

    const result = await useCase.execute(
      baseCommand([
        { buffer: PDF_BYTES, originalFilename: "cctp.pdf", mimeType: "application/pdf" },
        { buffer: Buffer.from("png bytes"), originalFilename: "plan.png", mimeType: "image/png" },
      ]),
    );
    expect(result.accepted).toHaveLength(2);

    const afterTwoAccepted = await dceRepository.findByTenderId({ organizationId: "org-1", tenderId: "tender-1" });
    expect(afterTwoAccepted!.revision).toBe(before!.revision + 2);

    // Ré-importer le MÊME contenu est rejeté comme doublon (mission P1-2) — la révision n'avance
    // jamais pour un fichier effectivement rejeté.
    const duplicateResult = await useCase.execute(baseCommand([{ buffer: PDF_BYTES, originalFilename: "cctp.pdf", mimeType: "application/pdf" }]));
    expect(duplicateResult.rejected).toHaveLength(1);

    const afterDuplicate = await dceRepository.findByTenderId({ organizationId: "org-1", tenderId: "tender-1" });
    expect(afterDuplicate!.revision).toBe(afterTwoAccepted!.revision);
  });

  it("BLOQUANT (correctif audit — P1 'incrément best-effort masque un vrai changement') — if incrementRevision itself fails, nothing is created at all for that file (clean, retry-safe)", async () => {
    vi.spyOn(dceRepository, "incrementRevision").mockRejectedValueOnce(new Error("simulated DB failure"));
    const useCase = buildUseCase();

    await expect(useCase.execute(baseCommand([{ buffer: PDF_BYTES, originalFilename: "cctp.pdf", mimeType: "application/pdf" }]))).rejects.toThrow(
      "simulated DB failure",
    );

    expect(createDocumentUseCase.execute).not.toHaveBeenCalled();
    const dce = await dceRepository.findByTenderId({ organizationId: "org-1", tenderId: "tender-1" });
    expect(dce!.status).not.toBe(DceStatus.Imported);
  });

  it("if document creation fails AFTER the revision already advanced, the failure direction is safe: revision stays advanced (false STALE), never a false CURRENT", async () => {
    const before = await dceRepository.findByTenderId({ organizationId: "org-1", tenderId: "tender-1" });
    const failingCreate = { execute: vi.fn(async () => { throw new Error("simulated storage failure"); }) } as unknown as CreateDocumentWithFirstVersionUseCase;
    const useCase = new ImportDceFilesUseCase(
      dceRepository,
      dceDocumentRepository,
      new FakeFileSignatureDetector(null),
      auditLogWriter,
      new FixedClock(),
      new SequentialIdGenerator(),
      fakeGetTenderUseCase(),
      failingCreate,
      internalDocumentCleanupService,
      { canOperateOnTender: vi.fn(async () => true), runTenderOperationEntitled: vi.fn(async (_i: unknown, op: () => Promise<unknown>) => op()) } as never,
    );

    await expect(
      useCase.execute(baseCommand([{ buffer: PDF_BYTES, originalFilename: "cctp.pdf", mimeType: "application/pdf" }])),
    ).rejects.toThrow("simulated storage failure");

    const after = await dceRepository.findByTenderId({ organizationId: "org-1", tenderId: "tender-1" });
    expect(after!.revision).toBe(before!.revision + 1);
  });

  it("classifies each accepted file and assigns a processing status that reflects its real format (mission P1-3)", async () => {
    const useCase = buildUseCase();

    const result = await useCase.execute(
      baseCommand([
        { buffer: PDF_BYTES, originalFilename: "cctp.pdf", mimeType: "application/pdf" },
        { buffer: Buffer.from("png bytes"), originalFilename: "plan.png", mimeType: "image/png" },
        { buffer: Buffer.from("annex bytes"), originalFilename: "annexe-1.pdf", mimeType: "application/pdf" },
      ]),
    );

    expect(result.accepted.map((doc) => doc.category)).toEqual(["TECHNICAL", "DRAWINGS", "OTHER"]);
    // PDF (texte ou scanné indécidable sans ouvrir le contenu) -> jamais READY_FOR_OCR directement.
    expect(result.accepted[0]?.processingStatus).toBe("PENDING_TEXT_INSPECTION");
    // Image -> candidat OCR confiant.
    expect(result.accepted[1]?.processingStatus).toBe("READY_FOR_OCR");
    expect(result.accepted[2]?.processingStatus).toBe("PENDING_TEXT_INSPECTION");
  });

  it("assigns READY_FOR_NATIVE_EXTRACTION to DOCX/XLSX, never OCR (mission P1-3)", async () => {
    const useCase = buildUseCase();

    const result = await useCase.execute(
      baseCommand([
        {
          buffer: Buffer.from("docx bytes"),
          originalFilename: "cctp.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
        {
          buffer: Buffer.from("xlsx bytes"),
          originalFilename: "bpu.xlsx",
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ]),
    );

    expect(result.accepted.map((doc) => doc.processingStatus)).toEqual([
      "READY_FOR_NATIVE_EXTRACTION",
      "READY_FOR_NATIVE_EXTRACTION",
    ]);
  });

  it("never calls the internal cleanup on the success path", async () => {
    const useCase = buildUseCase();

    await useCase.execute(
      baseCommand([{ buffer: PDF_BYTES, originalFilename: "cctp.pdf", mimeType: "application/pdf" }]),
    );

    expect(internalDocumentCleanupService.purgeJustCreatedDocument).not.toHaveBeenCalled();
  });

  it("mission P1-1 bis — CONTRIBUTOR (who has dce:import but never DocumentPermission.Delete) still triggers a full compensation when DceDocument creation fails, and the original error propagates", async () => {
    const linkingFailure = new Error("unexpected DB failure while creating the DceDocument link");
    vi.spyOn(dceDocumentRepository, "create").mockRejectedValueOnce(linkingFailure);
    const useCase = buildUseCase();

    // baseCommand() utilise actorRole: "CONTRIBUTOR" — confirmé sans organization:member ni
    // DocumentPermission.Delete (voir bible/03-domain/permissions.md) : le use case n'a jamais
    // besoin de cette permission pour compenser, contrairement à l'ancienne implémentation basée
    // sur DeleteDocumentUseCase (protégé par RBAC).
    await expect(
      useCase.execute(baseCommand([{ buffer: PDF_BYTES, originalFilename: "cctp.pdf", mimeType: "application/pdf" }])),
    ).rejects.toThrow(linkingFailure);

    // Le mécanisme interne ne reçoit et n'a besoin d'aucune information d'acteur/rôle : sa
    // signature (organizationId + documentId uniquement) exclut structurellement toute
    // dépendance au RBAC utilisateur — jamais actorId ni actorRole transmis.
    expect(internalDocumentCleanupService.purgeJustCreatedDocument).toHaveBeenCalledWith({
      organizationId: "org-1",
      documentId: "document-1",
    });
    expect(internalDocumentCleanupService.purgeJustCreatedDocument).toHaveBeenCalledTimes(1);
    const call = vi.mocked(internalDocumentCleanupService.purgeJustCreatedDocument).mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(call).not.toHaveProperty("actorId");
    expect(call).not.toHaveProperty("actorRole");

    // Aucun DceDocument ni entrée d'audit ne doit survivre à l'échec.
    expect(await dceDocumentRepository.listSummariesByDceId({ organizationId: "org-1", dceId: "dce-1" })).toHaveLength(
      0,
    );
    expect(auditLogWriter.entries).toHaveLength(0);
  });

  it("logs but does not mask the original error when the internal cleanup itself fails (mission P1-1)", async () => {
    const linkingFailure = new Error("unexpected DB failure while creating the DceDocument link");
    vi.spyOn(dceDocumentRepository, "create").mockRejectedValueOnce(linkingFailure);
    internalDocumentCleanupService = fakeInternalDocumentCleanupService({
      purgeJustCreatedDocument: vi.fn().mockRejectedValue(new Error("compensation also failed")),
    });
    const useCase = buildUseCase();

    await expect(
      useCase.execute(baseCommand([{ buffer: PDF_BYTES, originalFilename: "cctp.pdf", mimeType: "application/pdf" }])),
    ).rejects.toThrow(linkingFailure);

    expect(internalDocumentCleanupService.purgeJustCreatedDocument).toHaveBeenCalled();
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
      internalDocumentCleanupService,
      { canOperateOnTender: vi.fn(async () => true), runTenderOperationEntitled: vi.fn(async (_i: unknown, op: () => Promise<unknown>) => op()) } as never,
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
      internalDocumentCleanupService,
      { canOperateOnTender: vi.fn(async () => true), runTenderOperationEntitled: vi.fn(async (_i: unknown, op: () => Promise<unknown>) => op()) } as never,
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
