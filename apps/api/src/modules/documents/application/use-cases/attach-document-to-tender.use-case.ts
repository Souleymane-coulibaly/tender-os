import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { GetTenderUseCase } from "../../../tenders";
import { DocumentTenderAssociation } from "../../domain/document-tender-association.entity";
import { DocumentNotFoundError, DuplicateDocumentTenderAssociationError } from "../../domain/errors";
import { DocumentPermission } from "../../domain/document-permission";
import { assertHasDocumentPermission } from "../policies/document-authorization.policy";
import { toDocumentTenderAssociationSummary, type DocumentTenderAssociationSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import {
  DOCUMENT_TENDER_ASSOCIATION_REPOSITORY,
  type DocumentTenderAssociationRepository,
} from "../ports/document-tender-association.repository";
import { DOCUMENT_REPOSITORY, type DocumentRepository } from "../ports/document.repository";

export type AttachDocumentToTenderCommand = Readonly<{
  organizationId: string;
  documentId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

/**
 * L'appartenance à la même organisation n'est garantie par aucune contrainte SQL native
 * multi-table (conception §N) : elle est vérifiée ici, en chargeant le Document et le Tender
 * scopés à `organizationId` — un Tender d'une autre organisation ne peut structurellement pas
 * être trouvé (GetTenderUseCase lève TenderNotFoundError, jamais une fuite d'existence).
 */
@Injectable()
export class AttachDocumentToTenderUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documentRepository: DocumentRepository,
    @Inject(DOCUMENT_TENDER_ASSOCIATION_REPOSITORY)
    private readonly associationRepository: DocumentTenderAssociationRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly getTenderUseCase: GetTenderUseCase,
  ) {}

  async execute(command: AttachDocumentToTenderCommand): Promise<DocumentTenderAssociationSummary> {
    assertHasDocumentPermission(command.actorRole, DocumentPermission.AttachToTender);

    const document = await this.documentRepository.findById({
      organizationId: command.organizationId,
      documentId: command.documentId,
    });
    if (!document) {
      throw new DocumentNotFoundError();
    }

    await this.getTenderUseCase.execute({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorRole: command.actorRole,
    });

    const alreadyAssociated = await this.associationRepository.exists({
      organizationId: command.organizationId,
      documentId: command.documentId,
      tenderId: command.tenderId,
    });
    if (alreadyAssociated) {
      throw new DuplicateDocumentTenderAssociationError();
    }

    const association = DocumentTenderAssociation.create({
      documentId: command.documentId,
      tenderId: command.tenderId,
      organizationId: command.organizationId,
      createdByUserId: command.actorId,
      occurredAt: this.clock.now(),
    });

    await this.associationRepository.create(association);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "document.attached_to_tender",
      resourceType: "document",
      resourceId: command.documentId,
      requestId: command.requestId,
      metadata: { tenderId: command.tenderId },
    });

    return toDocumentTenderAssociationSummary(association);
  }
}
