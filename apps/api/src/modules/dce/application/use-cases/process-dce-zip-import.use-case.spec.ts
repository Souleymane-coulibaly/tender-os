import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateDocumentWithFirstVersionUseCase, InternalDocumentCleanupService } from "../../../documents";
import type { GetTenderUseCase } from "../../../tenders";
import { Dce } from "../../domain/dce.aggregate";
import { DceId } from "../../domain/dce-id.value-object";
import { ZipSecurityViolationError } from "../../domain/errors";
import { DceImportJobStatus } from "../../domain/dce-import-job-status";
import { DceImportJob } from "../../domain/dce-import-job.aggregate";
import type { ZipArchiveInspector, ZipExtractedEntry, ZipImportLimits } from "../ports/zip-archive-inspector";
import {
  FakeFileSignatureDetector,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryDceDocumentRepository,
  InMemoryDceImportJobRepository,
  InMemoryDceRepository,
  SequentialIdGenerator,
} from "../../test-support/fakes";
import { ImportDceFilesUseCase } from "./import-dce-files.use-case";
import { ProcessDceZipImportUseCase } from "./process-dce-zip-import.use-case";

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

/**
 * Mission Sprint 8A.2 (correction bug #3 "import ZIP lourd échoue ou bloque") — couvre
 * l'orchestrateur de traitement en tâche de fond, successeur direct de l'ancien
 * `ImportDceZipUseCase` (supprimé, ses scénarios sont repris ici) avec en plus les transitions de
 * statut du job (jamais observables avant ce sprint, tout se passait dans la requête HTTP).
 */
describe("ProcessDceZipImportUseCase", () => {
  let dceRepository: InMemoryDceRepository;
  let dceDocumentRepository: InMemoryDceDocumentRepository;
  let jobRepository: InMemoryDceImportJobRepository;

  beforeEach(async () => {
    dceRepository = new InMemoryDceRepository();
    dceDocumentRepository = new InMemoryDceDocumentRepository();
    jobRepository = new InMemoryDceImportJobRepository();

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
    return new ProcessDceZipImportUseCase(
      jobRepository,
      new StaticZipArchiveInspector(entriesOrError),
      { maxFileSizeBytes: 10 * 1024 * 1024, maxFilesPerImport: 20, zipLimits: GENEROUS_ZIP_LIMITS },
      new FixedClock(),
      importDceFilesUseCase,
    );
  }

  async function seedJob(): Promise<DceImportJob> {
    const job = DceImportJob.create({
      id: "job-1",
      organizationId: "org-1",
      tenderId: "tender-1",
      originalFilename: "archive.zip",
      sizeBytes: 1024,
      createdByUserId: "user-1",
      occurredAt: new Date(),
    });
    await jobRepository.create(job);
    return job;
  }

  function baseCommand() {
    return {
      organizationId: "org-1",
      tenderId: "tender-1",
      jobId: "job-1",
      actorId: "user-1",
      actorRole: "CONTRIBUTOR",
      zipBuffer: Buffer.from("irrelevant, inspector is stubbed"),
    };
  }

  it("imports every valid entry and marks the job READY", async () => {
    await seedJob();
    const useCase = buildUseCase([
      { entryName: "cctp.pdf", buffer: Buffer.from("%PDF-1.7 fake content") },
      { entryName: "plan.png", buffer: Buffer.from("png bytes") },
    ]);

    await useCase.execute(baseCommand());

    const job = await jobRepository.findById({ organizationId: "org-1", jobId: "job-1" });
    expect(job?.status).toBe(DceImportJobStatus.Ready);
    expect(job?.result?.accepted).toHaveLength(2);
    expect(job?.acceptedCount).toBe(2);
    expect(job?.rejectedCount).toBe(0);
  });

  it("marks the job PARTIALLY_READY when a nested .zip entry is rejected per-file, without failing the rest", async () => {
    await seedJob();
    const useCase = buildUseCase([
      { entryName: "cctp.pdf", buffer: Buffer.from("%PDF-1.7 fake content") },
      { entryName: "nested.zip", buffer: Buffer.from("PK..") },
    ]);

    await useCase.execute(baseCommand());

    const job = await jobRepository.findById({ organizationId: "org-1", jobId: "job-1" });
    expect(job?.status).toBe(DceImportJobStatus.PartiallyReady);
    expect(job?.result?.accepted).toHaveLength(1);
    expect(job?.result?.rejected).toHaveLength(1);
    expect(job?.result?.rejected[0]?.originalFilename).toBe("nested.zip");
  });

  it("marks the job PARTIALLY_READY when an unsupported entry format is rejected per-file", async () => {
    await seedJob();
    const useCase = buildUseCase([{ entryName: "malware.exe", buffer: Buffer.from("MZ...") }]);

    await useCase.execute(baseCommand());

    const job = await jobRepository.findById({ organizationId: "org-1", jobId: "job-1" });
    expect(job?.status).toBe(DceImportJobStatus.PartiallyReady);
    expect(job?.result?.accepted).toHaveLength(0);
    expect(job?.result?.rejected).toHaveLength(1);
  });

  it("marks the job FAILED (never a silent hang) when the archive is structurally rejected (Zip Slip / security)", async () => {
    await seedJob();
    const useCase = buildUseCase(new ZipSecurityViolationError({ reason: "path traversal detected" }));

    await useCase.execute(baseCommand());

    const job = await jobRepository.findById({ organizationId: "org-1", jobId: "job-1" });
    expect(job?.status).toBe(DceImportJobStatus.Failed);
    expect(job?.errorMessage).toMatch(/path traversal detected/);
  });

  it("mission P1-1 bis — a ZIP entry that fails DceDocument linking marks the job FAILED and still triggers the internal compensation", async () => {
    await seedJob();
    const purgeJustCreatedDocument = vi.fn().mockResolvedValue(undefined);
    const internalDocumentCleanupService = { purgeJustCreatedDocument } as unknown as InternalDocumentCleanupService;
    const useCase = buildUseCase([{ entryName: "cctp.pdf", buffer: Buffer.from("%PDF-1.7 fake content") }], {
      internalDocumentCleanupService,
    });
    vi.spyOn(dceDocumentRepository, "create").mockRejectedValueOnce(new Error("unexpected DB failure"));

    await useCase.execute(baseCommand());

    expect(purgeJustCreatedDocument).toHaveBeenCalledWith({ organizationId: "org-1", documentId: "document-1" });
    const job = await jobRepository.findById({ organizationId: "org-1", jobId: "job-1" });
    expect(job?.status).toBe(DceImportJobStatus.Failed);
    expect(job?.errorMessage).toMatch(/unexpected DB failure/);
  });

  it("progresses the job through CREATED -> EXTRACTING -> IMPORTING before reaching a terminal status", async () => {
    const job = await seedJob();
    expect(job.status).toBe(DceImportJobStatus.Created);
    const useCase = buildUseCase([{ entryName: "cctp.pdf", buffer: Buffer.from("%PDF-1.7 fake content") }]);

    const seenStatuses: string[] = [];
    const originalSave = jobRepository.save.bind(jobRepository);
    vi.spyOn(jobRepository, "save").mockImplementation(async (savedJob) => {
      seenStatuses.push(savedJob.status);
      return originalSave(savedJob);
    });

    await useCase.execute(baseCommand());

    expect(seenStatuses).toEqual([DceImportJobStatus.Extracting, DceImportJobStatus.Importing, DceImportJobStatus.Ready]);
  });

  it("throws DceImportJobNotFoundError for an unknown or foreign-org job id, never processing a job it doesn't own", async () => {
    const useCase = buildUseCase([]);
    await expect(useCase.execute({ ...baseCommand(), jobId: "does-not-exist" })).rejects.toThrow("Import job not found");
  });
});
