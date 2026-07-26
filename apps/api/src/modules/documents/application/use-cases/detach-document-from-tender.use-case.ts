import { Inject, Injectable } from "@nestjs/common";
import { DocumentPermission } from "../../domain/document-permission";
import { DocumentTenderAssociationNotFoundError } from "../../domain/errors";
import { assertHasDocumentPermission } from "../policies/document-authorization.policy";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import {
  DOCUMENT_TENDER_ASSOCIATION_REPOSITORY,
  type DocumentTenderAssociationRepository,
} from "../ports/document-tender-association.repository";

export type DetachDocumentFromTenderCommand = Readonly<{
  organizationId: string;
  documentId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

/** Supprime uniquement le lien — jamais le document, ses versions, ni le fichier physique
 *  (conception §D, §15). */
@Injectable()
export class DetachDocumentFromTenderUseCase {
  constructor(
    @Inject(DOCUMENT_TENDER_ASSOCIATION_REPOSITORY)
    private readonly associationRepository: DocumentTenderAssociationRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: DetachDocumentFromTenderCommand): Promise<void> {
    assertHasDocumentPermission(command.actorRole, DocumentPermission.AttachToTender);

    const exists = await this.associationRepository.exists({
      organizationId: command.organizationId,
      documentId: command.documentId,
      tenderId: command.tenderId,
    });
    if (!exists) {
      throw new DocumentTenderAssociationNotFoundError();
    }

    await this.associationRepository.delete({
      organizationId: command.organizationId,
      documentId: command.documentId,
      tenderId: command.tenderId,
    });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "document.detached_from_tender",
      resourceType: "document",
      resourceId: command.documentId,
      requestId: command.requestId,
      metadata: { tenderId: command.tenderId },
    });
  }
}
