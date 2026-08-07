import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { GetTenderUseCase } from "../../../tenders";
import { DceDocumentCategory } from "../../domain/dce-document-category";
import { DceDocumentNotFoundError, DceNotFoundError } from "../../domain/errors";
import { DcePermission } from "../../domain/dce-permission";
import { assertHasDcePermission } from "../policies/dce-authorization.policy";
import { assertTenderNotArchivedForDceMutation } from "../policies/dce-tender-mutation.policy";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { DCE_DOCUMENT_REPOSITORY, type DceDocumentRepository } from "../ports/dce-document.repository";
import { DCE_REPOSITORY, type DceRepository } from "../ports/dce.repository";
import type { DceDocumentSummary } from "../dtos";

export type CorrectDceDocumentCategoryCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  documentId: string;
  actorId: string;
  actorRole: string;
  category: DceDocumentCategory;
  reason?: string | undefined;
  requestId?: string | undefined;
}>;

/**
 * V2 Sprint 4 — correction utilisateur de la classification initiale (mission "correction de
 * classification avec historique") : `category` reste un simple champ mutable (jamais deux colonnes
 * "IA" / "utilisateur" — la classification initiale est déjà déterministe, pas IA, voir
 * `dce-document-classifier.ts`), mais TOUTE correction est journalisée dans l'AuditLog avec la
 * valeur précédente ET la nouvelle — jamais silencieusement écrasée. L'historique complet des
 * corrections reste ainsi consultable indéfiniment via l'AuditLog (append-only), sans nouvelle
 * table dédiée (mission "ne pas complexifier inutilement").
 */
@Injectable()
export class CorrectDceDocumentCategoryUseCase {
  constructor(
    @Inject(DCE_REPOSITORY) private readonly dceRepository: DceRepository,
    @Inject(DCE_DOCUMENT_REPOSITORY) private readonly dceDocumentRepository: DceDocumentRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly getTenderUseCase: GetTenderUseCase,
  ) {}

  async execute(command: CorrectDceDocumentCategoryCommand): Promise<DceDocumentSummary> {
    assertHasDcePermission(command.actorRole, DcePermission.Replace);

    const tender = await this.getTenderUseCase.execute({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
    });
    assertTenderNotArchivedForDceMutation(tender);

    const dce = await this.dceRepository.findByTenderId({ organizationId: command.organizationId, tenderId: command.tenderId });
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

    const previousCategory = link.category;
    const now = this.clock.now();
    link.correctCategory(command.category, now);

    if (previousCategory !== command.category) {
      await this.dceDocumentRepository.updateCategory({
        organizationId: command.organizationId,
        dceId: dce.id.value,
        documentId: command.documentId,
        category: command.category,
        updatedAt: now,
      });

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "dce.document_category_corrected",
        resourceType: "dce_document",
        resourceId: command.documentId,
        requestId: command.requestId,
        metadata: { dceId: dce.id.value, tenderId: command.tenderId, previousCategory, newCategory: command.category, reason: command.reason },
      });
    }

    const summary = await this.dceDocumentRepository.getSummaryByDocumentId({
      organizationId: command.organizationId,
      dceId: dce.id.value,
      documentId: command.documentId,
    });
    if (!summary) {
      throw new DceDocumentNotFoundError();
    }
    return summary;
  }
}
