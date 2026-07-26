import { Readable } from "node:stream";
import { beforeEach, describe, expect, it } from "vitest";
import { DocumentVersionNotFoundError } from "../../domain/errors";
import { DocumentDomain } from "../../domain/document-domain";
import { DocumentId } from "../../domain/document-id.value-object";
import { DocumentOrigin } from "../../domain/document-origin";
import { DocumentVersion } from "../../domain/document-version.entity";
import { Document } from "../../domain/document.aggregate";
import { InMemoryStorageProvider, wireDocumentFakes } from "../../test-support/fakes";
import { DownloadDocumentVersionUseCase } from "./download-document-version.use-case";

describe("DownloadDocumentVersionUseCase", () => {
  let fakes: ReturnType<typeof wireDocumentFakes>;
  let storageProvider: InMemoryStorageProvider;
  let useCase: DownloadDocumentVersionUseCase;

  beforeEach(async () => {
    fakes = wireDocumentFakes();
    storageProvider = new InMemoryStorageProvider();
    useCase = new DownloadDocumentVersionUseCase(fakes.documentRepository, fakes.versionRepository, storageProvider);

    const document = Document.create({
      id: DocumentId.from("doc-1"),
      organizationId: "org-1",
      title: "Rapport",
      origin: DocumentOrigin.UserUpload,
      domain: DocumentDomain.Organization,
      createdByUserId: "user-1",
      occurredAt: new Date(),
    });
    const version = DocumentVersion.create({
      id: "version-1",
      organizationId: "org-1",
      documentId: "doc-1",
      versionNumber: 1,
      originalFilename: "rapport.pdf",
      sanitizedFilename: "rapport.pdf",
      mimeType: "application/pdf",
      extension: "pdf",
      sizeBytes: 4,
      checksum: "abc",
      storageKey: "org-1/doc-1/version-1.pdf",
      uploadedByUserId: "user-1",
      occurredAt: new Date(),
    });
    document.promoteVersion({ versionId: "version-1", versionNumber: 1, occurredAt: new Date() });
    await fakes.documentRepository.seed(document);
    await fakes.versionRepository.seed(version);
    await storageProvider.put({
      key: "org-1/doc-1/version-1.pdf",
      content: Readable.from(Buffer.from("test")),
      contentType: "application/pdf",
      sizeBytes: 4,
    });
  });

  it("streams the current version by default", async () => {
    const result = await useCase.execute({ organizationId: "org-1", documentId: "doc-1", actorRole: "READ_ONLY" });

    expect(result.kind).toBe("stream");
    if (result.kind === "stream") {
      expect(result.filename).toBe("rapport.pdf");
      expect(result.contentType).toBe("application/pdf");
    }
  });

  it("throws DocumentVersionNotFoundError for a version that does not exist", async () => {
    await expect(
      useCase.execute({ organizationId: "org-1", documentId: "doc-1", versionId: "no-such-version", actorRole: "READ_ONLY" }),
    ).rejects.toThrow(DocumentVersionNotFoundError);
  });
});
