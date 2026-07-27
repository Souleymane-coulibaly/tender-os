import { Inject, Injectable } from "@nestjs/common";
import { DeleteDocumentUseCase } from "../../../documents";
import { GetTenderUseCase } from "../../../tenders";
import { DceDocumentNotFoundError, DceNotFoundError } from "../../domain/errors";
import { DcePermission } from "../../domain/dce-permission";
import { assertHasDcePermission } from "../policies/dce-authorization.policy";
import { assertTenderNotArchivedForDceMutation } from "../policies/dce-tender-mutation.policy";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { DCE_DOCUMENT_REPOSITORY, type DceDocumentRepository } from "../ports/dce-document.repository";
import { DCE_REPOSITORY, type DceRepository } from "../ports/dce.repository";

export type DeleteDceDocumentCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  documentId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

/**
 * Suppression logique (mission §"règles métier" — même stratégie de suppression que Documents,
 * jamais dupliquée : `Document.deletedAt` reste l'unique source de vérité, DceDocument ne porte
 * aucun état de suppression propre — voir listSummariesByDceId qui filtre déjà dessus).
 */
@Injectable()
export class DeleteDceDocumentUseCase {
  constructor(
    @Inject(DCE_REPOSITORY) private readonly dceRepository: DceRepository,
    @Inject(DCE_DOCUMENT_REPOSITORY) private readonly dceDocumentRepository: DceDocumentRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly deleteDocumentUseCase: DeleteDocumentUseCase,
  ) {}

  async execute(command: DeleteDceDocumentCommand): Promise<void> {
    assertHasDcePermission(command.actorRole, DcePermission.Delete);

    const tender = await this.getTenderUseCase.execute({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorRole: command.actorRole,
    });
    assertTenderNotArchivedForDceMutation(tender);

    const dce = await this.dceRepository.findByTenderId({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
    });
    if (!dce) {
      throw new DceNotFoundError();
    }

    const link = await this.dceDocumentRepository.findByDceIdAndDocumentId({
      organizationId: command.organizationId,
      dceId: dce.id.value,
      documentId: command.documentId,
    });
    if (!link) {
      throw new DceDocumentNotFoundError();
    }

    await this.deleteDocumentUseCase.execute({
      organizationId: command.organizationId,
      documentId: command.documentId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      requestId: command.requestId,
    });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "dce.document_deleted",
      resourceType: "dce_document",
      resourceId: command.documentId,
      requestId: command.requestId,
      metadata: { dceId: dce.id.value, tenderId: command.tenderId },
    });
  }
}
