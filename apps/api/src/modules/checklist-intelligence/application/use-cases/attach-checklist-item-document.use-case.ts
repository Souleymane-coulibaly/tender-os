import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase } from "../../../client-portfolio";
import {
  DOCUMENT_VERSION_REPOSITORY,
  DocumentVersionNotFoundError,
  GetDocumentUseCase,
  type DocumentVersionRepository,
} from "../../../documents";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import {
  assertHasTenderPermission,
  assertTenderMutationAllowed,
  AUDIT_LOG_WRITER,
  CHECKLIST_ITEM_REPOSITORY,
  ChecklistDocumentMatchStatus,
  loadChecklistItem,
  TENDER_REPOSITORY,
  TenderPermission,
  toChecklistItemSummary,
  type AuditLogWriter,
  type ChecklistItemRepository,
  type ChecklistItemSummary,
  type TenderRepository,
} from "../../../tenders";

export type AttachChecklistItemDocumentCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  itemId: string;
  actorId: string;
  actorRole: string;
  documentId: string;
  documentVersionId?: string | undefined;
  matchStatus: string;
  score?: number | undefined;
  reasons?: readonly string[] | undefined;
  expiresAt?: string | undefined;
  requestId?: string | undefined;
}>;

/** V2 Sprint 6 §16-18 — toujours une action utilisateur EXPLICITE, jamais automatique même sur un
 *  EXACT_MATCH (mission §17). Vérifie que le document appartient bien à l'organisation active
 *  avant tout attachement (`GetDocumentUseCase`, déjà organisation-scopé) — jamais un `documentId`
 *  d'une autre organisation silencieusement accepté. */
@Injectable()
export class AttachChecklistItemDocumentUseCase {
  constructor(
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistRepository: ChecklistItemRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(DOCUMENT_VERSION_REPOSITORY) private readonly documentVersionRepository: DocumentVersionRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly getDocumentUseCase: GetDocumentUseCase,
  ) {}

  async execute(command: AttachChecklistItemDocumentCommand): Promise<ChecklistItemSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.ManageChecklist);
    await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);

    // Lève DocumentNotFoundError (organisation-scopé) si `documentId` n'appartient pas à cette
    // organisation — jamais un attachement cross-tenant, même si l'UUID est syntaxiquement valide.
    await this.getDocumentUseCase.execute({ organizationId: command.organizationId, documentId: command.documentId, actorRole: command.actorRole, actorId: command.actorId });

    // Correctif audit Codex P1 — `matchedDocumentVersionId` est dénormalisé (aucune FK, voir
    // `schema.prisma`) : sans cette vérification applicative, un `documentVersionId` inexistant, ou
    // appartenant à un AUTRE document (voire une autre organisation), serait persisté tel quel.
    // `findById` est déjà scopé `(organizationId, documentId)` — un `null` couvre les trois cas.
    if (command.documentVersionId !== undefined) {
      const version = await this.documentVersionRepository.findById({
        organizationId: command.organizationId,
        documentId: command.documentId,
        versionId: command.documentVersionId,
      });
      if (!version) {
        throw new DocumentVersionNotFoundError();
      }
    }

    const item = await loadChecklistItem(this.checklistRepository, command);
    const occurredAt = this.clock.now();

    item.attachDocument(
      {
        documentId: command.documentId,
        documentVersionId: command.documentVersionId,
        matchStatus: command.matchStatus as ChecklistDocumentMatchStatus,
        score: command.score,
        reasons: command.reasons,
        expiresAt: command.expiresAt ? new Date(command.expiresAt) : undefined,
      },
      occurredAt,
    );
    await this.checklistRepository.save(item);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "tender.checklist_document_attached",
      resourceType: "tender_checklist_item",
      resourceId: item.id,
      requestId: command.requestId,
      metadata: { tenderId: command.tenderId, documentId: command.documentId, matchStatus: command.matchStatus },
    });

    await this.outboxWriter.write({
      organizationId: command.organizationId,
      events: [
        {
          eventType: "ChecklistDocumentAttached",
          aggregateType: "TenderChecklistItem",
          aggregateId: item.id,
          payload: { tenderId: command.tenderId, itemId: item.id, documentId: command.documentId },
          occurredAt,
        },
      ],
    });

    return toChecklistItemSummary(item);
  }
}

export type DetachChecklistItemDocumentCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  itemId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

@Injectable()
export class DetachChecklistItemDocumentUseCase {
  constructor(
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistRepository: ChecklistItemRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: DetachChecklistItemDocumentCommand): Promise<ChecklistItemSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.ManageChecklist);
    await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);

    const item = await loadChecklistItem(this.checklistRepository, command);
    const previousDocumentId = item.matchedDocumentId;
    item.detachDocument(this.clock.now());
    await this.checklistRepository.save(item);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "tender.checklist_document_detached",
      resourceType: "tender_checklist_item",
      resourceId: item.id,
      requestId: command.requestId,
      metadata: { tenderId: command.tenderId, previousDocumentId },
    });

    return toChecklistItemSummary(item);
  }
}
