import { beforeEach, describe, expect, it } from "vitest";
import { ConcurrentVersionCreationError, DocumentNotFoundError } from "../../domain/errors";
import { DocumentDomain } from "../../domain/document-domain";
import { DocumentId } from "../../domain/document-id.value-object";
import { DocumentOrigin } from "../../domain/document-origin";
import { DocumentVersion } from "../../domain/document-version.entity";
import { Document } from "../../domain/document.aggregate";
import {
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryStorageProvider,
  SequentialIdGenerator,
  wireDocumentFakes,
} from "../../test-support/fakes";
import { AddDocumentVersionUseCase } from "./add-document-version.use-case";

const MAX_SIZE = 10 * 1024 * 1024;

describe("AddDocumentVersionUseCase", () => {
  let fakes: ReturnType<typeof wireDocumentFakes>;
  let storageProvider: InMemoryStorageProvider;
  let useCase: AddDocumentVersionUseCase;

  beforeEach(async () => {
    fakes = wireDocumentFakes();
    storageProvider = new InMemoryStorageProvider();
    useCase = new AddDocumentVersionUseCase(
      fakes.documentRepository,
      fakes.versionRepository,
      storageProvider,
      new InMemoryAuditLogWriter(),
      new FixedClock(),
      new SequentialIdGenerator(),
    );

    const document = Document.create({
      id: DocumentId.from("doc-1"),
      organizationId: "org-1",
      title: "Rapport",
      origin: DocumentOrigin.UserUpload,
      domain: DocumentDomain.Organization,
      createdByUserId: "user-1",
      occurredAt: new Date(),
    });
    const firstVersion = DocumentVersion.create({
      id: "version-1",
      organizationId: "org-1",
      documentId: "doc-1",
      versionNumber: 1,
      originalFilename: "rapport-v1.pdf",
      sanitizedFilename: "rapport-v1.pdf",
      mimeType: "application/pdf",
      extension: "pdf",
      sizeBytes: 4,
      checksum: "checksum-v1",
      storageKey: "org-1/doc-1/version-1.pdf",
      uploadedByUserId: "user-1",
      occurredAt: new Date(),
    });
    document.promoteVersion({ versionId: "version-1", versionNumber: 1, occurredAt: new Date() });
    await fakes.documentRepository.seed(document);
    await fakes.versionRepository.seed(firstVersion);
  });

  function file() {
    return { buffer: Buffer.from("content-v2"), originalFilename: "rapport-v2.pdf", mimeType: "application/pdf" };
  }

  it("adds version 2 and promotes the document to it", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      documentId: "doc-1",
      actorId: "user-1",
      actorRole: "CONTRIBUTOR",
      file: file(),
      maxFileSizeBytes: MAX_SIZE,
    });

    expect(result.currentVersionNumber).toBe(2);
  });

  it("throws DocumentNotFoundError for a document in another organization", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-2",
        documentId: "doc-1",
        actorId: "user-1",
        actorRole: "CONTRIBUTOR",
        file: file(),
        maxFileSizeBytes: MAX_SIZE,
      }),
    ).rejects.toThrow(DocumentNotFoundError);
  });

  it("throws ConcurrentVersionCreationError when two versions race for the same number", async () => {
    // Simule une course : les deux appels lisent le même highestVersionNumber avant que l'un
    // des deux n'écrive — la seconde tentative d'écriture doit être rejetée.
    const originalAddVersionAndPromote = fakes.documentRepository.addVersionAndPromote.bind(
      fakes.documentRepository,
    );
    let callCount = 0;
    fakes.documentRepository.addVersionAndPromote = async (input) => {
      callCount += 1;
      if (callCount === 2) {
        throw new ConcurrentVersionCreationError();
      }
      await originalAddVersionAndPromote(input);
    };

    await useCase.execute({
      organizationId: "org-1",
      documentId: "doc-1",
      actorId: "user-1",
      actorRole: "CONTRIBUTOR",
      file: file(),
      maxFileSizeBytes: MAX_SIZE,
    });

    await expect(
      useCase.execute({
        organizationId: "org-1",
        documentId: "doc-1",
        actorId: "user-2",
        actorRole: "CONTRIBUTOR",
        file: file(),
        maxFileSizeBytes: MAX_SIZE,
      }),
    ).rejects.toThrow(ConcurrentVersionCreationError);
  });

  it("cleans up the stored file when the database write fails", async () => {
    fakes.documentRepository.addVersionAndPromote = async () => {
      throw new Error("db failure");
    };

    await expect(
      useCase.execute({
        organizationId: "org-1",
        documentId: "doc-1",
        actorId: "user-1",
        actorRole: "CONTRIBUTOR",
        file: file(),
        maxFileSizeBytes: MAX_SIZE,
      }),
    ).rejects.toThrow("db failure");

    expect(storageProvider.objects.size).toBe(0);
  });
});
