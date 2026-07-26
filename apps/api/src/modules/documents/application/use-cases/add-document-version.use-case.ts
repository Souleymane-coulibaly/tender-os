import { Inject, Injectable } from "@nestjs/common";
import { Readable } from "node:stream";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { DocumentNotFoundError } from "../../domain/errors";
import { DocumentPermission } from "../../domain/document-permission";
import { DocumentVersion } from "../../domain/document-version.entity";
import { assertHasDocumentPermission } from "../policies/document-authorization.policy";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { DOCUMENT_REPOSITORY, type DocumentRepository } from "../ports/document.repository";
import { DOCUMENT_VERSION_REPOSITORY, type DocumentVersionRepository } from "../ports/document-version.repository";
import { STORAGE_PROVIDER, type StorageProvider } from "../ports/storage-provider";
import { toDocumentSummary, type DocumentSummary } from "../dtos";
import { type IncomingFile, validateIncomingFile } from "../incoming-file";
import { buildStorageKey } from "../storage-key";

export type AddDocumentVersionCommand = Readonly<{
  organizationId: string;
  documentId: string;
  actorId: string;
  actorRole: string;
  file: IncomingFile;
  maxFileSizeBytes: number;
  requestId?: string | undefined;
}>;

/**
 * Ajoute une nouvelle version à un Document existant, actif et non supprimé. Le numéro de
 * version est calculé de façon optimiste (`getHighestVersionNumber` + 1) ; la contrainte
 * unique (documentId, versionNumber) posée en base est le véritable garde-fou de concurrence —
 * une violation remonte `ConcurrentVersionCreationError` depuis l'implémentation du repository
 * (conception §G).
 */
@Injectable()
export class AddDocumentVersionUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documentRepository: DocumentRepository,
    @Inject(DOCUMENT_VERSION_REPOSITORY) private readonly versionRepository: DocumentVersionRepository,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: AddDocumentVersionCommand): Promise<DocumentSummary> {
    assertHasDocumentPermission(command.actorRole, DocumentPermission.UploadVersion);

    const document = await this.documentRepository.findById({
      organizationId: command.organizationId,
      documentId: command.documentId,
    });
    if (!document) {
      throw new DocumentNotFoundError();
    }

    const validated = validateIncomingFile(command.file, command.maxFileSizeBytes);
    const occurredAt = this.clock.now();

    const highestVersionNumber = await this.versionRepository.getHighestVersionNumber({
      organizationId: command.organizationId,
      documentId: command.documentId,
    });
    const nextVersionNumber = highestVersionNumber + 1;

    const versionId = this.idGenerator.generate();
    const storageKey = buildStorageKey({
      organizationId: command.organizationId,
      documentId: command.documentId,
      versionId,
      extension: validated.extension,
    });

    await this.storageProvider.put({
      key: storageKey,
      content: Readable.from(command.file.buffer),
      contentType: command.file.mimeType,
      sizeBytes: validated.sizeBytes,
    });

    try {
      const version = DocumentVersion.create({
        id: versionId,
        organizationId: command.organizationId,
        documentId: command.documentId,
        versionNumber: nextVersionNumber,
        originalFilename: command.file.originalFilename,
        sanitizedFilename: validated.sanitizedFilename,
        mimeType: command.file.mimeType,
        extension: validated.extension,
        sizeBytes: validated.sizeBytes,
        checksum: validated.checksum,
        storageKey,
        uploadedByUserId: command.actorId,
        occurredAt,
      });

      document.promoteVersion({ versionId, versionNumber: nextVersionNumber, occurredAt });

      await this.documentRepository.addVersionAndPromote({ document, version });

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "document.version_created",
        resourceType: "document_version",
        resourceId: versionId,
        requestId: command.requestId,
        metadata: { documentId: command.documentId, versionNumber: nextVersionNumber, checksum: validated.checksum },
      });

      return toDocumentSummary(document, version);
    } catch (error) {
      await this.storageProvider.delete(storageKey).catch(() => undefined);
      throw error;
    }
  }
}
