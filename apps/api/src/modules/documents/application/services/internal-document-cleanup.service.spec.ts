import { Readable } from "node:stream";
import { beforeEach, describe, expect, it } from "vitest";
import { DocumentId } from "../../domain/document-id.value-object";
import { DocumentOrigin } from "../../domain/document-origin";
import { DocumentDomain } from "../../domain/document-domain";
import { DocumentVersion } from "../../domain/document-version.entity";
import { Document } from "../../domain/document.aggregate";
import {
  InMemoryDocumentRepository,
  InMemoryDocumentVersionRepository,
  InMemoryStorageProvider,
  wireDocumentFakes,
} from "../../test-support/fakes";
import { InternalDocumentCleanupService } from "./internal-document-cleanup.service";

const ORG_A = "org-a";
const ORG_B = "org-b";

function buildSingleVersionDocument(input: {
  documentId: string;
  organizationId: string;
  storageKey: string;
}): { document: Document; version: DocumentVersion } {
  const documentId = DocumentId.from(input.documentId);
  const occurredAt = new Date("2026-01-01T00:00:00Z");

  const document = Document.create({
    id: documentId,
    organizationId: input.organizationId,
    title: "cctp.pdf",
    origin: DocumentOrigin.Dce,
    domain: DocumentDomain.Tender,
    createdByUserId: "user-1",
    occurredAt,
  });

  const version = DocumentVersion.create({
    id: "version-1",
    organizationId: input.organizationId,
    documentId: documentId.value,
    versionNumber: 1,
    originalFilename: "cctp.pdf",
    sanitizedFilename: "cctp.pdf",
    mimeType: "application/pdf",
    extension: "pdf",
    sizeBytes: 42,
    checksum: "hash-1",
    storageKey: input.storageKey,
    uploadedByUserId: "user-1",
    occurredAt,
  });

  document.promoteVersion({ versionId: version.id, versionNumber: 1, occurredAt });

  return { document, version };
}

describe("InternalDocumentCleanupService", () => {
  let documentRepository: InMemoryDocumentRepository;
  let versionRepository: InMemoryDocumentVersionRepository;
  let storageProvider: InMemoryStorageProvider;
  let service: InternalDocumentCleanupService;

  beforeEach(() => {
    const fakes = wireDocumentFakes();
    documentRepository = fakes.documentRepository;
    versionRepository = fakes.versionRepository;
    storageProvider = new InMemoryStorageProvider();
    service = new InternalDocumentCleanupService(documentRepository, versionRepository, storageProvider);
  });

  async function seed(input: { documentId: string; organizationId: string; storageKey: string }) {
    const { document, version } = buildSingleVersionDocument(input);
    await documentRepository.seed(document);
    await versionRepository.seed(version);
    await storageProvider.put({
      key: input.storageKey,
      content: Readable.from(Buffer.from("pdf bytes")),
      contentType: "application/pdf",
      sizeBytes: 9,
    });
  }

  it("purges a just-created single-version document: removes the DB record and the stored file", async () => {
    await seed({ documentId: "document-1", organizationId: ORG_A, storageKey: "org-a/document-1/v1.pdf" });

    await service.purgeJustCreatedDocument({ organizationId: ORG_A, documentId: "document-1" });

    expect(await documentRepository.findById({ organizationId: ORG_A, documentId: "document-1" })).toBeNull();
    expect(await storageProvider.exists("org-a/document-1/v1.pdf")).toBe(false);
  });

  it("never purges a document with more than one version (refuses without throwing, leaves it untouched)", async () => {
    await seed({ documentId: "document-1", organizationId: ORG_A, storageKey: "org-a/document-1/v1.pdf" });
    const existing = await documentRepository.findById({ organizationId: ORG_A, documentId: "document-1" });
    existing!.promoteVersion({ versionId: "version-2", versionNumber: 2, occurredAt: new Date() });
    await documentRepository.save(existing!);

    await expect(
      service.purgeJustCreatedDocument({ organizationId: ORG_A, documentId: "document-1" }),
    ).resolves.toBeUndefined();

    expect(await documentRepository.findById({ organizationId: ORG_A, documentId: "document-1" })).not.toBeNull();
    expect(await storageProvider.exists("org-a/document-1/v1.pdf")).toBe(true);
  });

  it("never purges a document belonging to a different organization (multi-tenant isolation preserved)", async () => {
    await seed({ documentId: "document-1", organizationId: ORG_A, storageKey: "org-a/document-1/v1.pdf" });

    await service.purgeJustCreatedDocument({ organizationId: ORG_B, documentId: "document-1" });

    expect(await documentRepository.findById({ organizationId: ORG_A, documentId: "document-1" })).not.toBeNull();
    expect(await storageProvider.exists("org-a/document-1/v1.pdf")).toBe(true);
  });

  it("does not throw when the document does not exist at all", async () => {
    await expect(
      service.purgeJustCreatedDocument({ organizationId: ORG_A, documentId: "missing-document" }),
    ).resolves.toBeUndefined();
  });

  it("logs but does not throw when storage deletion fails, and still purges the DB record", async () => {
    await seed({ documentId: "document-1", organizationId: ORG_A, storageKey: "org-a/document-1/v1.pdf" });
    storageProvider.delete = async () => {
      throw new Error("storage provider unavailable");
    };

    await expect(
      service.purgeJustCreatedDocument({ organizationId: ORG_A, documentId: "document-1" }),
    ).resolves.toBeUndefined();

    expect(await documentRepository.findById({ organizationId: ORG_A, documentId: "document-1" })).toBeNull();
  });

  it("logs but does not throw when the DB hard-delete fails", async () => {
    await seed({ documentId: "document-1", organizationId: ORG_A, storageKey: "org-a/document-1/v1.pdf" });
    documentRepository.hardDeleteJustCreatedDocument = async () => {
      throw new Error("database unavailable");
    };

    await expect(
      service.purgeJustCreatedDocument({ organizationId: ORG_A, documentId: "document-1" }),
    ).resolves.toBeUndefined();
  });
});
