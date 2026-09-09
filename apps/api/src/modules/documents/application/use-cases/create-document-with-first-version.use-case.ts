import { Inject, Injectable } from "@nestjs/common";
import { Readable } from "node:stream";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
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
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
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

    /** Vrai des que la transaction Document + premiere version est VALIDEE (voir catch). */
    let persisted = false;

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
      // Checkpoint TENDEROS-2.1-H.5 — a partir d'ICI, la transaction est VALIDEE : le Document et sa
      // premiere version existent durablement en base, et le fichier depose est la seule copie du
      // contenu qu'ils decrivent.
      persisted = true;

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

      // V2 Sprint 22 (billing, étape 22E, correctif audit Codex P1-02 round 3) — "action métier ->
      // vérification du seuil", jamais sur une lecture : le point d'écriture réel du stockage.
      await this.outboxWriter.write({
        organizationId: command.organizationId,
        events: [{ eventType: "DocumentVersionAdded", aggregateType: "DocumentVersion", aggregateId: versionId, payload: {}, occurredAt }],
      });

      return toDocumentSummary(document, version);
    } catch (error) {
      // Checkpoint TENDEROS-2.1-H.5 — la compensation ne s'applique QU'AVANT la validation de la
      // transaction (conception §R : « si la transaction echoue apres un upload reussi, le fichier
      // physique est supprime »).
      //
      // Elle s'executait auparavant pour TOUTE erreur, y compris survenue APRES le commit — une
      // panne du journal d'audit ou de l'Outbox detruisait alors le fichier tout en laissant le
      // Document et sa version engages. Reproduit par injection : `documentSurvit: true`,
      // `storageDeleteAppele: 1`. Le resultat etait pire qu'un Document sans version : un document
      // d'apparence parfaitement valide, dont le contenu n'existait plus — perte silencieuse, que
      // rien dans la base ne signalait.
      if (!persisted) {
        await this.storageProvider.delete(storageKey).catch(() => undefined);
      }
      throw error;
    }
  }
}
