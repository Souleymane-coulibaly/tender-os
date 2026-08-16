import { Readable } from "node:stream";
import { beforeEach, describe, expect, it } from "vitest";
import type { GetTenderUseCase } from "../../../tenders";
import { DocumentVersionNotFoundError } from "../../domain/errors";
import { DocumentDomain } from "../../domain/document-domain";
import { DocumentId } from "../../domain/document-id.value-object";
import { DocumentOrigin } from "../../domain/document-origin";
import { DocumentVersion } from "../../domain/document-version.entity";
import { Document } from "../../domain/document.aggregate";
import { InMemoryDocumentTenderAssociationRepository, InMemoryStorageProvider, InMemoryStorageProviderWithSignedUrl, wireDocumentFakes } from "../../test-support/fakes";
import { DownloadDocumentVersionUseCase } from "./download-document-version.use-case";

// Le document de ce test n'est jamais associé à un Tender : `assertDocumentClientAccess`
// court-circuite avant tout appel à `getTenderUseCase` — un simple stub jamais invoqué suffit ici.
const UNUSED_GET_TENDER_USE_CASE = {} as GetTenderUseCase;

describe("DownloadDocumentVersionUseCase", () => {
  let fakes: ReturnType<typeof wireDocumentFakes>;
  let storageProvider: InMemoryStorageProvider;
  let useCase: DownloadDocumentVersionUseCase;

  beforeEach(async () => {
    fakes = wireDocumentFakes();
    storageProvider = new InMemoryStorageProvider();
    useCase = new DownloadDocumentVersionUseCase(
      fakes.documentRepository,
      fakes.versionRepository,
      storageProvider,
      new InMemoryDocumentTenderAssociationRepository(),
      UNUSED_GET_TENDER_USE_CASE,
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
    const result = await useCase.execute({ organizationId: "org-1", documentId: "doc-1", actorRole: "READ_ONLY", actorId: "user-1" });

    expect(result.kind).toBe("stream");
    if (result.kind === "stream") {
      expect(result.filename).toBe("rapport.pdf");
      expect(result.contentType).toBe("application/pdf");
    }
  });

  it("throws DocumentVersionNotFoundError for a version that does not exist", async () => {
    await expect(
      useCase.execute({ organizationId: "org-1", documentId: "doc-1", versionId: "no-such-version", actorRole: "READ_ONLY", actorId: "user-1" }),
    ).rejects.toThrow(DocumentVersionNotFoundError);
  });

  describe("P1 R2/Connecteurs (audit Codex) — execute() garde son comportement HTTP inchangé", () => {
    it("still produces a signed-URL redirect when the active StorageProvider exposes generateSignedUrl (mission §15 — never break the browser download path)", async () => {
      const signedStorage = new InMemoryStorageProviderWithSignedUrl();
      await signedStorage.put({
        key: "org-1/doc-1/version-1.pdf",
        content: Readable.from(Buffer.from("test")),
        contentType: "application/pdf",
        sizeBytes: 4,
      });
      const r2LikeUseCase = new DownloadDocumentVersionUseCase(
        fakes.documentRepository,
        fakes.versionRepository,
        signedStorage,
        new InMemoryDocumentTenderAssociationRepository(),
        UNUSED_GET_TENDER_USE_CASE,
      );

      const result = await r2LikeUseCase.execute({ organizationId: "org-1", documentId: "doc-1", actorRole: "READ_ONLY", actorId: "user-1" });

      expect(result.kind).toBe("redirect");
      if (result.kind === "redirect") {
        expect(result.url).toContain("org-1/doc-1/version-1.pdf");
      }
    });

    it("getInternalReadStream() always returns a direct stream, even when generateSignedUrl is available — never a redirect for a server-to-server caller", async () => {
      const signedStorage = new InMemoryStorageProviderWithSignedUrl();
      await signedStorage.put({
        key: "org-1/doc-1/version-1.pdf",
        content: Readable.from(Buffer.from("test")),
        contentType: "application/pdf",
        sizeBytes: 4,
      });
      const r2LikeUseCase = new DownloadDocumentVersionUseCase(
        fakes.documentRepository,
        fakes.versionRepository,
        signedStorage,
        new InMemoryDocumentTenderAssociationRepository(),
        UNUSED_GET_TENDER_USE_CASE,
      );

      const result = await r2LikeUseCase.getInternalReadStream({ organizationId: "org-1", documentId: "doc-1", actorRole: "READ_ONLY", actorId: "user-1" });

      expect(result.filename).toBe("rapport.pdf");
      expect(result.contentType).toBe("application/pdf");
      const chunks: Buffer[] = [];
      for await (const chunk of result.stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      expect(Buffer.concat(chunks).toString()).toBe("test");
    });

    it("getInternalReadStream() throws DocumentVersionNotFoundError when the storage object is missing, never a silent empty success", async () => {
      // Enregistrement DB présent (version connue), mais objet physique absent du storage — le seul
      // scénario que `getMetadata` doit détecter avant toute tentative de lecture (mission §10/§18).
      const emptyStorage = new InMemoryStorageProviderWithSignedUrl();
      const r2LikeUseCase = new DownloadDocumentVersionUseCase(
        fakes.documentRepository,
        fakes.versionRepository,
        emptyStorage,
        new InMemoryDocumentTenderAssociationRepository(),
        UNUSED_GET_TENDER_USE_CASE,
      );

      await expect(
        r2LikeUseCase.getInternalReadStream({ organizationId: "org-1", documentId: "doc-1", actorRole: "READ_ONLY", actorId: "user-1" }),
      ).rejects.toThrow(DocumentVersionNotFoundError);
    });
  });
});
