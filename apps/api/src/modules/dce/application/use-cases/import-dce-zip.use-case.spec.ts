import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateDocumentWithFirstVersionUseCase, InternalDocumentCleanupService } from "../../../documents";
import type { GetTenderUseCase } from "../../../tenders";
import { ZipSecurityViolationError } from "../../domain/errors";
import { Dce } from "../../domain/dce.aggregate";
import { DceId } from "../../domain/dce-id.value-object";
import type { ZipArchiveInspector, ZipExtractedEntry, ZipImportLimits } from "../ports/zip-archive-inspector";
import {
  FakeFileSignatureDetector,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryDceDocumentRepository,
  InMemoryDceRepository,
  SequentialIdGenerator,
} from "../../test-support/fakes";
import { ImportDceFilesUseCase } from "./import-dce-files.use-case";
import { ImportDceZipUseCase } from "./import-dce-zip.use-case";

const GENEROUS_ZIP_LIMITS: ZipImportLimits = {
  maxEntries: 100,
  maxTotalUncompressedBytes: 50 * 1024 * 1024,
  maxSingleEntryUncompressedBytes: 20 * 1024 * 1024,
  maxCompressionRatio: 200,
};

function fakeGetTenderUseCase(): GetTenderUseCase {
  return { execute: vi.fn(async () => ({ id: "tender-1", organizationId: "org-1" })) } as unknown as GetTenderUseCase;
}

function fakeCreateDocumentUseCase(dceDocumentRepository: InMemoryDceDocumentRepository): CreateDocumentWithFirstVersionUseCase {
  let counter = 0;
  return {
    execute: vi.fn(async (command: { title: string; file: { buffer: Buffer; originalFilename: string; mimeType: string } }) => {
      counter += 1;
      const documentId = `document-${counter}`;
      const checksum = createHash("sha256").update(command.file.buffer).digest("hex");
      dceDocumentRepository.documentVersions.set(documentId, {
        originalFilename: command.file.originalFilename,
        sanitizedFilename: command.title,
        mimeType: command.file.mimeType,
        extension: /\.([a-zA-Z0-9]+)$/.exec(command.file.originalFilename)?.[1]?.toLowerCase() ?? "",
        sizeBytes: command.file.buffer.length,
        checksum,
        currentVersionNumber: 1,
      });
      return { id: documentId, title: command.title, currentVersionNumber: 1 };
    }),
  } as unknown as CreateDocumentWithFirstVersionUseCase;
}

class StaticZipArchiveInspector implements ZipArchiveInspector {
  constructor(private readonly result: readonly ZipExtractedEntry[] | Error) {}

  async extract(): Promise<ZipExtractedEntry[]> {
    if (this.result instanceof Error) {
      throw this.result;
    }
    return [...this.result];
  }
}

describe("ImportDceZipUseCase", () => {
  let dceRepository: InMemoryDceRepository;
  let dceDocumentRepository: InMemoryDceDocumentRepository;

  beforeEach(async () => {
    dceRepository = new InMemoryDceRepository();
    dceDocumentRepository = new InMemoryDceDocumentRepository();

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

  function buildUseCase(
    entriesOrError: readonly ZipExtractedEntry[] | Error,
    overrides?: { internalDocumentCleanupService?: InternalDocumentCleanupService },
  ) {
    const internalDocumentCleanupService =
      overrides?.internalDocumentCleanupService ??
      ({ purgeJustCreatedDocument: vi.fn().mockResolvedValue(undefined) } as unknown as InternalDocumentCleanupService);
    const importDceFilesUseCase = new ImportDceFilesUseCase(
      dceRepository,
      dceDocumentRepository,
      new FakeFileSignatureDetector(null),
      new InMemoryAuditLogWriter(),
      new FixedClock(),
      new SequentialIdGenerator(),
      fakeGetTenderUseCase(),
      fakeCreateDocumentUseCase(dceDocumentRepository),
      internalDocumentCleanupService,
    );
    return {
      useCase: new ImportDceZipUseCase(new StaticZipArchiveInspector(entriesOrError), importDceFilesUseCase),
      internalDocumentCleanupService,
    };
  }

  function baseCommand() {
    return {
      organizationId: "org-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "CONTRIBUTOR",
      maxFileSizeBytes: 10 * 1024 * 1024,
      maxFilesPerImport: 20,
      zipLimits: GENEROUS_ZIP_LIMITS,
    };
  }

  it("imports every valid entry extracted from the archive", async () => {
    const { useCase } = buildUseCase([
      { entryName: "cctp.pdf", buffer: Buffer.from("%PDF-1.7 fake content") },
      { entryName: "plan.png", buffer: Buffer.from("png bytes") },
    ]);

    const result = await useCase.execute({ ...baseCommand(), zipBuffer: Buffer.from("irrelevant, inspector is stubbed") });

    expect(result.accepted).toHaveLength(2);
    expect(result.rejected).toHaveLength(0);
  });

  it("rejects a nested .zip entry per-file, without failing the rest of the batch (no nested archives)", async () => {
    const { useCase } = buildUseCase([
      { entryName: "cctp.pdf", buffer: Buffer.from("%PDF-1.7 fake content") },
      { entryName: "nested.zip", buffer: Buffer.from("PK..") },
    ]);

    const result = await useCase.execute({ ...baseCommand(), zipBuffer: Buffer.from("irrelevant") });

    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.originalFilename).toBe("nested.zip");
  });

  it("rejects an unsupported entry format per-file", async () => {
    const { useCase } = buildUseCase([{ entryName: "malware.exe", buffer: Buffer.from("MZ...") }]);

    const result = await useCase.execute({ ...baseCommand(), zipBuffer: Buffer.from("irrelevant") });

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
  });

  it("propagates ZipSecurityViolationError for the whole archive when the inspector rejects it structurally", async () => {
    const { useCase } = buildUseCase(new ZipSecurityViolationError({ reason: "path traversal detected" }));

    await expect(useCase.execute({ ...baseCommand(), zipBuffer: Buffer.from("irrelevant") })).rejects.toThrow(
      ZipSecurityViolationError,
    );
  });

  it("mission P1-1 bis — a ZIP entry that fails DceDocument linking also triggers the internal compensation (same orchestrator as the plain file import)", async () => {
    const purgeJustCreatedDocument = vi.fn().mockResolvedValue(undefined);
    const internalDocumentCleanupService = { purgeJustCreatedDocument } as unknown as InternalDocumentCleanupService;
    const { useCase } = buildUseCase(
      [{ entryName: "cctp.pdf", buffer: Buffer.from("%PDF-1.7 fake content") }],
      { internalDocumentCleanupService },
    );
    vi.spyOn(dceDocumentRepository, "create").mockRejectedValueOnce(new Error("unexpected DB failure"));

    await expect(useCase.execute({ ...baseCommand(), zipBuffer: Buffer.from("irrelevant") })).rejects.toThrow(
      "unexpected DB failure",
    );

    expect(purgeJustCreatedDocument).toHaveBeenCalledWith({ organizationId: "org-1", documentId: "document-1" });
  });
});
