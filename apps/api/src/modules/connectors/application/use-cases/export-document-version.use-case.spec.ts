import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import type { GetTenderUseCase } from "../../../tenders";
import { DocumentDomain } from "../../../documents/domain/document-domain";
import { DocumentId } from "../../../documents/domain/document-id.value-object";
import { DocumentOrigin } from "../../../documents/domain/document-origin";
import { DocumentVersion } from "../../../documents/domain/document-version.entity";
import { Document } from "../../../documents/domain/document.aggregate";
import { DocumentNotFoundError, DocumentVersionNotFoundError } from "../../../documents/domain/errors";
import { DownloadDocumentVersionUseCase } from "../../../documents/application/use-cases/download-document-version.use-case";
import {
  InMemoryDocumentTenderAssociationRepository,
  InMemoryStorageProvider,
  InMemoryStorageProviderWithSignedUrl,
  wireDocumentFakes,
} from "../../../documents/test-support/fakes";
import { ConnectionStatus, ConnectorProvider } from "../../domain/enums";
import { ExternalConnection } from "../../domain/external-connection.entity";
import { EnsureFreshAccessTokenService } from "../services/ensure-fresh-access-token.service";
import {
  FakeConnectorProviderAdapter,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryCredentialCipher,
  InMemoryExternalConnectionRepository,
  InMemoryExternalFileExportRecordRepository,
  SequentialIdGenerator,
} from "../../test-support/fakes";
import { ExportDocumentVersionUseCase } from "./export-document-version.use-case";

// Le document de ce test n'est jamais associé à un Tender : `assertDocumentClientAccess`
// court-circuite avant tout appel à `getTenderUseCase` (même motif que
// `download-document-version.use-case.spec.ts`).
const UNUSED_GET_TENDER_USE_CASE = {} as GetTenderUseCase;
const CREDENTIAL_CIPHER = new InMemoryCredentialCipher();
const CONNECTION_ID = "connection-1";
const ORG_A = "org-a";
const ORG_B = "org-b";

/**
 * Mission P1 (audit Codex, R2/Connecteurs) — reproduit exactement le bug : avant ce correctif,
 * `ExportDocumentVersionUseCase` appelait `DownloadDocumentVersionUseCase.execute()` (le chemin
 * HTTP/navigateur), qui bascule en `{kind:"redirect"}` dès que le `StorageProvider` actif expose
 * `generateSignedUrl` (R2) — l'export rejetait alors systématiquement ce résultat
 * (`ExportTargetNotFoundError`). `storageProviderFactory` permet à chaque test de choisir un
 * storage "local-like" (`InMemoryStorageProvider`) ou "R2-like" (`InMemoryStorageProviderWithSignedUrl`)
 * sans jamais dépendre du SDK R2 réel.
 */
function buildHarness<TStorage extends InMemoryStorageProvider>(storageProviderFactory: () => TStorage, organizationId: string = ORG_A) {
  const documentFakes = wireDocumentFakes();
  const storageProvider = storageProviderFactory();
  const downloadDocumentVersion = new DownloadDocumentVersionUseCase(
    documentFakes.documentRepository,
    documentFakes.versionRepository,
    storageProvider,
    new InMemoryDocumentTenderAssociationRepository(),
    UNUSED_GET_TENDER_USE_CASE,
  );

  const connectionRepository = new InMemoryExternalConnectionRepository();
  const adapter = new FakeConnectorProviderAdapter(ConnectorProvider.Microsoft365);
  const adapters = new Map([[ConnectorProvider.Microsoft365, adapter]]);
  const exportRecordRepository = new InMemoryExternalFileExportRecordRepository();
  const auditLogWriter = new InMemoryAuditLogWriter();
  const clock = new FixedClock();
  const idGenerator = new SequentialIdGenerator();
  const ensureFreshAccessToken = new EnsureFreshAccessTokenService(connectionRepository, adapters, CREDENTIAL_CIPHER, clock);

  const connection = ExternalConnection.rehydrate({
    id: CONNECTION_ID,
    organizationId,
    provider: ConnectorProvider.Microsoft365,
    name: "Microsoft 365",
    status: ConnectionStatus.Active,
    scopes: ["Files.ReadWrite"],
    externalAccountId: "external-account-1",
    encryptedAccessToken: CREDENTIAL_CIPHER.encrypt("fresh-access-token"),
    encryptedRefreshToken: CREDENTIAL_CIPHER.encrypt("refresh-token"),
    expiresAt: new Date(clock.now().getTime() + 60 * 60 * 1000),
    allowedClientAccountIds: [],
    createdBy: "user-1",
    connectedBy: "user-1",
    createdAt: clock.now(),
    updatedAt: clock.now(),
  });
  connectionRepository.connections.push(connection);

  const useCase = new ExportDocumentVersionUseCase(
    connectionRepository,
    adapters,
    exportRecordRepository,
    auditLogWriter,
    clock,
    idGenerator,
    ensureFreshAccessToken,
    downloadDocumentVersion,
  );

  return { useCase, documentFakes, storageProvider, adapter, exportRecordRepository };
}

async function seedDocument(documentFakes: ReturnType<typeof wireDocumentFakes>, storageProvider: InMemoryStorageProvider, organizationId: string) {
  const document = Document.create({
    id: DocumentId.from("doc-1"),
    organizationId,
    title: "Rapport",
    origin: DocumentOrigin.UserUpload,
    domain: DocumentDomain.Organization,
    createdByUserId: "user-1",
    occurredAt: new Date(),
  });
  const version = DocumentVersion.create({
    id: "version-1",
    organizationId,
    documentId: "doc-1",
    versionNumber: 1,
    originalFilename: "rapport.pdf",
    sanitizedFilename: "rapport.pdf",
    mimeType: "application/pdf",
    extension: "pdf",
    sizeBytes: 4,
    checksum: "abc",
    storageKey: `${organizationId}/doc-1/version-1.pdf`,
    uploadedByUserId: "user-1",
    occurredAt: new Date(),
  });
  document.promoteVersion({ versionId: "version-1", versionNumber: 1, occurredAt: new Date() });
  await documentFakes.documentRepository.seed(document);
  await documentFakes.versionRepository.seed(version);
  await storageProvider.put({
    key: `${organizationId}/doc-1/version-1.pdf`,
    content: Readable.from(Buffer.from("test")),
    contentType: "application/pdf",
    sizeBytes: 4,
  });
}

function baseCommand(organizationId: string) {
  return {
    organizationId,
    actorId: "user-1",
    actorRole: "CONTRIBUTOR",
    connectionId: CONNECTION_ID,
    containerId: "container-1",
    folderId: "folder-1",
    documentId: "doc-1",
    versionId: "version-1",
  };
}

describe("ExportDocumentVersionUseCase — P1 R2/Connecteurs (audit Codex)", () => {
  describe("mission §16 — local storage (non-régression)", () => {
    it("exports successfully with LocalFilesystemStorageProvider-equivalent storage", async () => {
      const { useCase, documentFakes, storageProvider, adapter } = buildHarness(() => new InMemoryStorageProvider());
      await seedDocument(documentFakes, storageProvider, ORG_A);

      const remoteFile = await useCase.execute(baseCommand(ORG_A));

      expect(remoteFile.name).toBe("rapport.pdf");
      expect(adapter.uploadCalls).toHaveLength(1);
      expect(adapter.uploadCalls[0]?.content.toString()).toBe("test");
      expect(adapter.uploadCalls[0]?.mimeType).toBe("application/pdf");
    });
  });

  describe("mission §14/§17 — R2-like storage (le P1 lui-même)", () => {
    it("exports successfully even though the HTTP download use case would return a redirect for this storage", async () => {
      const { useCase, documentFakes, storageProvider, adapter } = buildHarness(() => new InMemoryStorageProviderWithSignedUrl());
      await seedDocument(documentFakes, storageProvider, ORG_A);

      // Preuve directe du bug reproduit : le chemin HTTP renverrait une redirection pour ce même
      // storage — l'export ne doit pourtant JAMAIS en dépendre.
      expect(storageProvider.generateSignedUrl).toBeDefined();

      const remoteFile = await useCase.execute(baseCommand(ORG_A));

      expect(remoteFile.name).toBe("rapport.pdf");
      expect(adapter.uploadCalls).toHaveLength(1);
      expect(adapter.uploadCalls[0]?.content.toString()).toBe("test");
      expect(adapter.uploadCalls[0]?.filename).toBe("rapport.pdf");
      expect(adapter.uploadCalls[0]?.mimeType).toBe("application/pdf");
    });
  });

  describe("mission §18 — objet R2 manquant", () => {
    it("fails cleanly (never marks the export as succeeded) when the storage object does not exist", async () => {
      const { useCase, documentFakes, adapter, exportRecordRepository } = buildHarness(() => new InMemoryStorageProviderWithSignedUrl());
      // Enregistrement DB présent, mais jamais de `put()` — objet physiquement absent du storage.
      const document = Document.create({
        id: DocumentId.from("doc-1"),
        organizationId: ORG_A,
        title: "Rapport",
        origin: DocumentOrigin.UserUpload,
        domain: DocumentDomain.Organization,
        createdByUserId: "user-1",
        occurredAt: new Date(),
      });
      const version = DocumentVersion.create({
        id: "version-1",
        organizationId: ORG_A,
        documentId: "doc-1",
        versionNumber: 1,
        originalFilename: "rapport.pdf",
        sanitizedFilename: "rapport.pdf",
        mimeType: "application/pdf",
        extension: "pdf",
        sizeBytes: 4,
        checksum: "abc",
        storageKey: `${ORG_A}/doc-1/version-1.pdf`,
        uploadedByUserId: "user-1",
        occurredAt: new Date(),
      });
      document.promoteVersion({ versionId: "version-1", versionNumber: 1, occurredAt: new Date() });
      await documentFakes.documentRepository.seed(document);
      await documentFakes.versionRepository.seed(version);

      await expect(useCase.execute(baseCommand(ORG_A))).rejects.toThrow(DocumentVersionNotFoundError);

      expect(adapter.uploadCalls).toHaveLength(0);
      const record = await exportRecordRepository.findByDestination({
        organizationId: ORG_A,
        connectionId: CONNECTION_ID,
        documentId: "doc-1",
        documentVersionId: "version-1",
        remoteContainerId: "container-1",
        remoteFolderId: "folder-1",
        filename: "rapport.pdf",
      });
      // Aucune réservation "réussie" ne doit rester — un échec de lecture storage ne doit jamais
      // être confondu avec un export terminé (mission §11/§18).
      expect(record?.isSucceeded()).not.toBe(true);
    });
  });

  describe("mission §19 — isolation multi-tenant", () => {
    it("org B cannot export org A's document, even by reusing org A's documentId/versionId", async () => {
      const { useCase, documentFakes, storageProvider, adapter } = buildHarness(() => new InMemoryStorageProviderWithSignedUrl(), ORG_B);
      // Le document existe réellement, mais appartient à ORG_A — jamais accessible via la connexion
      // (et l'acteur) d'ORG_B, quel que soit l'ID fourni.
      await seedDocument(documentFakes, storageProvider, ORG_A);

      await expect(useCase.execute(baseCommand(ORG_B))).rejects.toThrow(DocumentNotFoundError);

      expect(adapter.uploadCalls).toHaveLength(0);
    });
  });
});
