import { Inject, Injectable } from "@nestjs/common";
import { Readable } from "node:stream";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { parseDocumentDomain } from "../../domain/document-domain";
import { DocumentId } from "../../domain/document-id.value-object";
import { parseDocumentOrigin } from "../../domain/document-origin";
import { DocumentPermission } from "../../domain/document-permission";
import { DocumentVersion } from "../../domain/document-version.entity";
import { Document } from "../../domain/document.aggregate";
import { assertHasDocumentPermission } from "../policies/document-authorization.policy";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { DOCUMENT_REPOSITORY, type DocumentRepository } from "../ports/document.repository";
import { STORAGE_PROVIDER, type StorageProvider } from "../ports/storage-provider";
import { toDocumentSummary, type DocumentSummary } from "../dtos";
import { type IncomingFile, validateIncomingFile } from "../incoming-file";
import { buildStorageKey } from "../storage-key";

export type CreateDocumentWithFirstVersionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  title: string;
  description?: string | undefined;
  origin: string;
  domain: string;
  category?: string | undefined;
  file: IncomingFile;
  maxFileSizeBytes: number;
  requestId?: string | undefined;
}>;

/**
 * Un Document n'existe jamais sans au moins une version (conception §F) : upload physique
 * d'abord, puis transaction DB unique (Document + DocumentVersion + pointeur de version
 * courante). Si la transaction échoue après un upload réussi, le fichier physique est
 * supprimé en compensation (conception §R) — aucune ligne orpheline ne doit persister côté DB,
 * et si le nettoyage du stockage échoue à son tour, l'erreur d'origine reste prioritaire
 * (le fichier orphelin est un problème de nettoyage différé, pas une raison de masquer l'échec).
 */
@Injectable()
export class CreateDocumentWithFirstVersionUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documentRepository: DocumentRepository,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateDocumentWithFirstVersionCommand): Promise<DocumentSummary> {
    assertHasDocumentPermission(command.actorRole, DocumentPermission.Create);

    const validated = validateIncomingFile(command.file, command.maxFileSizeBytes);
    const origin = parseDocumentOrigin(command.origin);
    const domain = parseDocumentDomain(command.domain);
    const occurredAt = this.clock.now();

    const documentId = DocumentId.from(this.idGenerator.generate());
    const versionId = this.idGenerator.generate();
    const storageKey = buildStorageKey({
      organizationId: command.organizationId,
      documentId: documentId.value,
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
      const document = Document.create({
        id: documentId,
        organizationId: command.organizationId,
        title: command.title,
        description: command.description,
        origin,
        domain,
        category: command.category,
        createdByUserId: command.actorId,
        occurredAt,
      });

      const version = DocumentVersion.create({
        id: versionId,
        organizationId: command.organizationId,
        documentId: documentId.value,
        versionNumber: 1,
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

      document.promoteVersion({ versionId, versionNumber: 1, occurredAt });

      await this.documentRepository.createWithInitialVersion({ document, version });

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "document.created",
        resourceType: "document",
        resourceId: documentId.value,
        requestId: command.requestId,
        metadata: { origin, domain },
      });
      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "document.version_created",
        resourceType: "document_version",
        resourceId: versionId,
        requestId: command.requestId,
        metadata: { documentId: documentId.value, versionNumber: 1, checksum: validated.checksum },
      });

      return toDocumentSummary(document, version);
    } catch (error) {
      await this.storageProvider.delete(storageKey).catch(() => undefined);
      throw error;
    }
  }
}
