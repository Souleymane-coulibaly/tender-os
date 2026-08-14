import { beforeEach, describe, expect, it } from "vitest";
import { EmptyFileError, FileTooLargeError, UnsupportedFileTypeError } from "../../domain/errors";
import { DocumentPermissionMissingError } from "../../domain/errors";
import {
  FakeOutboxWriter,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryStorageProvider,
  SequentialIdGenerator,
  wireDocumentFakes,
} from "../../test-support/fakes";
import { CreateDocumentWithFirstVersionUseCase } from "./create-document-with-first-version.use-case";

const MAX_SIZE = 10 * 1024 * 1024;

describe("CreateDocumentWithFirstVersionUseCase", () => {
  let storageProvider: InMemoryStorageProvider;
  let auditLogWriter: InMemoryAuditLogWriter;
  let outbox: FakeOutboxWriter;
  let useCase: CreateDocumentWithFirstVersionUseCase;

  beforeEach(() => {
    const { documentRepository } = wireDocumentFakes();
    storageProvider = new InMemoryStorageProvider();
    auditLogWriter = new InMemoryAuditLogWriter();
    outbox = new FakeOutboxWriter();
    useCase = new CreateDocumentWithFirstVersionUseCase(
      documentRepository,
      storageProvider,
      auditLogWriter,
      new FixedClock(),
      new SequentialIdGenerator(),
      outbox,
    );
  });

  function validFile() {
    return { buffer: Buffer.from("%PDF-1.4 fake content"), originalFilename: "rapport.pdf", mimeType: "application/pdf" };
  }

  it("creates a document with version 1, active status, and two audit entries", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "CONTRIBUTOR",
      title: "Rapport financier",
      origin: "USER_UPLOAD",
      domain: "ORGANIZATION",
      file: validFile(),
      maxFileSizeBytes: MAX_SIZE,
    });

    expect(result.status).toBe("ACTIVE");
    expect(result.currentVersionNumber).toBe(1);
    expect(result.currentVersion?.versionNumber).toBe(1);
    expect(auditLogWriter.entries.map((entry) => entry.action)).toEqual([
      "document.created",
      "document.version_created",
    ]);
  });

  it("persists the file content in storage", async () => {
    await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "CONTRIBUTOR",
      title: "Rapport financier",
      origin: "USER_UPLOAD",
      domain: "ORGANIZATION",
      file: validFile(),
      maxFileSizeBytes: MAX_SIZE,
    });

    expect(storageProvider.objects.size).toBe(1);
  });

  it("V2 Sprint 22 (billing, étape 22E) — emits DocumentVersionAdded (jamais sur une lecture, toujours au point d'écriture réel)", async () => {
    await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "CONTRIBUTOR",
      title: "Rapport financier",
      origin: "USER_UPLOAD",
      domain: "ORGANIZATION",
      file: validFile(),
      maxFileSizeBytes: MAX_SIZE,
    });

    expect(outbox.events.map((e) => e.eventType)).toEqual(["DocumentVersionAdded"]);
  });

  it("refuses when the actor lacks document:create (Viewer tier)", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "READ_ONLY",
        title: "Rapport financier",
        origin: "USER_UPLOAD",
        domain: "ORGANIZATION",
        file: validFile(),
        maxFileSizeBytes: MAX_SIZE,
      }),
    ).rejects.toThrow(DocumentPermissionMissingError);

    expect(storageProvider.objects.size).toBe(0);
  });

  it("rejects an empty file before touching storage", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "CONTRIBUTOR",
        title: "Rapport financier",
        origin: "USER_UPLOAD",
        domain: "ORGANIZATION",
        file: { buffer: Buffer.alloc(0), originalFilename: "empty.pdf", mimeType: "application/pdf" },
        maxFileSizeBytes: MAX_SIZE,
      }),
    ).rejects.toThrow(EmptyFileError);
    expect(storageProvider.objects.size).toBe(0);
  });

  it("rejects a file exceeding the configured maximum size", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "CONTRIBUTOR",
        title: "Rapport financier",
        origin: "USER_UPLOAD",
        domain: "ORGANIZATION",
        file: validFile(),
        maxFileSizeBytes: 5,
      }),
    ).rejects.toThrow(FileTooLargeError);
  });

  it("rejects a MIME type / extension combination that is not on the allow-list", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "CONTRIBUTOR",
        title: "Script",
        origin: "USER_UPLOAD",
        domain: "ORGANIZATION",
        file: { buffer: Buffer.from("x"), originalFilename: "malware.exe", mimeType: "application/x-msdownload" },
        maxFileSizeBytes: MAX_SIZE,
      }),
    ).rejects.toThrow(UnsupportedFileTypeError);
  });
});
