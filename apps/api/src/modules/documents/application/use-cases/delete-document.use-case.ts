import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { DocumentNotFoundError } from "../../domain/errors";
import { DocumentPermission } from "../../domain/document-permission";
import { assertHasDocumentPermission } from "../policies/document-authorization.policy";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { DOCUMENT_REPOSITORY, type DocumentRepository } from "../ports/document.repository";

export type DeleteDocumentCommand = Readonly<{
  organizationId: string;
  documentId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

/**
 * Suppression logique uniquement (conception §F) : `deletedAt` renseigné, aucune écriture sur
 * le stockage physique. Le fichier physique est nettoyé plus tard par une procédure manuelle
 * documentée (pas de job automatique — décision validée : pas de file d'attente).
 */
@Injectable()
export class DeleteDocumentUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documentRepository: DocumentRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: DeleteDocumentCommand): Promise<void> {
    assertHasDocumentPermission(command.actorRole, DocumentPermission.Delete);

    const document = await this.documentRepository.findById({
      organizationId: command.organizationId,
      documentId: command.documentId,
    });
    if (!document) {
      throw new DocumentNotFoundError();
    }

    document.softDelete(this.clock.now());
    await this.documentRepository.save(document);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "document.deleted",
      resourceType: "document",
      resourceId: command.documentId,
      requestId: command.requestId,
    });
  }
}
