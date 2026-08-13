import { Inject, Injectable, Optional } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase } from "../../../client-portfolio";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import {
  ChecklistItem,
  ChecklistItemOrigin,
  ChecklistSubjectType,
  type ChecklistItemCriticality,
  type ChecklistItemType,
  type ChecklistRequirementLevel,
} from "../../domain/checklist-item.entity";
import { ChecklistItemNotFoundError, ChecklistSubcontractorSubjectNotFoundError, InvalidChecklistSubjectError } from "../../domain/errors";
import { TenderPermission } from "../../domain/tender-permission";
import { toChecklistItemSummary, type ChecklistItemSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { CHECKLIST_ITEM_REPOSITORY, type ChecklistItemRepository } from "../ports/checklist-item.repository";
import { CHECKLIST_ITEM_SOURCE_REPOSITORY, type ChecklistItemSourceRepository } from "../ports/checklist-item-source.repository";
import { SUBCONTRACTOR_SUBJECT_VALIDATOR, type SubcontractorSubjectValidator } from "../ports/subcontractor-subject-validator";
import { TENDER_LOT_REPOSITORY, type TenderLotRepository } from "../ports/tender-lot.repository";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { findChecklistDedupMatch } from "../services/checklist-dedup";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";
import { assertLotBelongsToTender, assertTenderMutationAllowed } from "../policies/tender-mutation-client-access.helper";

export type CreateChecklistItemCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  title: string;
  description?: string | undefined;
  required?: boolean | undefined;
  assignedTo?: string | undefined;
  dueDate?: string | undefined;
  displayOrder?: number | undefined;
  type?: ChecklistItemType | undefined;
  requirementLevel?: ChecklistRequirementLevel | undefined;
  conditionText?: string | undefined;
  criticality?: ChecklistItemCriticality | undefined;
  origin?: ChecklistItemOrigin | undefined;
  subjectType?: ChecklistSubjectType | undefined;
  subjectSubcontractorProfileId?: string | undefined;
  lotId?: string | undefined;
  requestId?: string | undefined;
  /** V2 Sprint 6 §11 — provenance de la première source (finding DCE ou suggestion IA). `undefined`
   *  pour une création manuelle : une source MANUAL sans finding/document est tout de même écrite,
   *  jamais un item sans aucune source (mission §11 "jamais une source supprimée" implique toujours
   *  au moins une). */
  source?:
    | {
        findingType?: string | undefined;
        findingId?: string | undefined;
        sourceSuggestionId?: string | undefined;
        documentId?: string | undefined;
        documentVersionId?: string | undefined;
        analysisVersion?: number | undefined;
        pageStart?: number | undefined;
        citation?: string | undefined;
        sectionTitle?: string | undefined;
        confidence?: number | undefined;
      }
    | undefined;
}>;

@Injectable()
export class CreateChecklistItemUseCase {
  constructor(
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistRepository: ChecklistItemRepository,
    @Inject(CHECKLIST_ITEM_SOURCE_REPOSITORY) private readonly sourceRepository: ChecklistItemSourceRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(TENDER_LOT_REPOSITORY) private readonly lotRepository: TenderLotRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    // Correctif audit Codex P2 — port+adapter (voir subcontractor-subject-validator.ts pour le
    // détail du pont @Global() qui évite le cycle tenders -> subcontractors -> documents -> tenders).
    @Optional()
    @Inject(SUBCONTRACTOR_SUBJECT_VALIDATOR)
    private readonly subcontractorSubjectValidator?: SubcontractorSubjectValidator,
  ) {}

  async execute(command: CreateChecklistItemCommand): Promise<ChecklistItemSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.ManageChecklist);

    await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);
    await assertLotBelongsToTender(this.lotRepository, command);

    // Correctif audit Codex P2 — `subjectSubcontractorProfileId` n'a de sens que pour un sujet
    // SUBCONTRACTOR (cohérence du contexte), et doit désigner un profil réel, de la même
    // organisation, non archivé (existence + organizationId + statut — jamais un UUID accepté tel
    // quel). Fail-closed si le pont n'est pas câblé : jamais un contournement silencieux.
    if (command.subjectSubcontractorProfileId !== undefined) {
      if (command.subjectType !== ChecklistSubjectType.Subcontractor) {
        throw new InvalidChecklistSubjectError();
      }
      if (!this.subcontractorSubjectValidator) {
        throw new ChecklistSubcontractorSubjectNotFoundError();
      }
      await this.subcontractorSubjectValidator.assertValid({
        organizationId: command.organizationId,
        subcontractorProfileId: command.subjectSubcontractorProfileId,
        actorRole: command.actorRole,
      });
    }

    const occurredAt = this.clock.now();

    // V2 Sprint 6 §11 — anti-doublon UNIQUEMENT pour les créations d'origine IA (jamais une
    // création manuelle : un humain choisit déjà explicitement de créer). Une correspondance forte
    // (>= 0.92) n'ouvre JAMAIS un second ChecklistItem : la provenance est ajoutée à l'item
    // existant à la place — jamais de source supprimée.
    if (command.origin === ChecklistItemOrigin.AiSuggestion) {
      // Correctif audit Codex P1 — verrou transactionnel AVANT la lecture de dédoublonnage : sans
      // lui, deux acceptations concurrentes de suggestions distinctes pour la même exigence (RC +
      // CCAP) peuvent toutes deux lire "aucune correspondance" avant que l'une n'ait committé. Le
      // verrou sérialise cette séquence lire-puis-écrire par Tender (voir le port pour le détail).
      await this.checklistRepository.lockTenderForDedup({ organizationId: command.organizationId, tenderId: command.tenderId });

      const existingItems = await this.checklistRepository.listByTender({ organizationId: command.organizationId, tenderId: command.tenderId });
      const dedupMatch = findChecklistDedupMatch(existingItems, {
        type: command.type ?? ("OTHER" as ChecklistItemType),
        lotId: command.lotId,
        subjectType: command.subjectType ?? ("CANDIDATE" as ChecklistSubjectType),
        title: command.title,
      });
      if (dedupMatch.kind === "merge") {
        const existing = await this.checklistRepository.findById({ organizationId: command.organizationId, tenderId: command.tenderId, itemId: dedupMatch.existingItemId });
        if (!existing) {
          throw new ChecklistItemNotFoundError();
        }
        await this.sourceRepository.create({
          id: this.idGenerator.generate(),
          organizationId: command.organizationId,
          checklistItemId: existing.id,
          findingType: command.source?.findingType,
          findingId: command.source?.findingId,
          sourceSuggestionId: command.source?.sourceSuggestionId,
          documentId: command.source?.documentId,
          documentVersionId: command.source?.documentVersionId,
          analysisVersion: command.source?.analysisVersion,
          pageStart: command.source?.pageStart,
          citation: command.source?.citation,
          sectionTitle: command.source?.sectionTitle,
          confidence: command.source?.confidence,
          createdAt: occurredAt,
        });
        await this.auditLogWriter.record({
          organizationId: command.organizationId,
          actorId: command.actorId,
          action: "tender.checklist_item_source_merged",
          resourceType: "tender_checklist_item",
          resourceId: existing.id,
          requestId: command.requestId,
          metadata: { tenderId: command.tenderId, similarity: dedupMatch.similarity },
        });
        return toChecklistItemSummary(existing);
      }
    }

    const item = ChecklistItem.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      title: command.title,
      description: command.description,
      required: command.required,
      assignedTo: command.assignedTo,
      dueDate: command.dueDate ? new Date(command.dueDate) : undefined,
      displayOrder: command.displayOrder,
      type: command.type,
      requirementLevel: command.requirementLevel,
      conditionText: command.conditionText,
      criticality: command.criticality,
      origin: command.origin,
      subjectType: command.subjectType,
      subjectSubcontractorProfileId: command.subjectSubcontractorProfileId,
      lotId: command.lotId,
      occurredAt,
    });

    await this.checklistRepository.save(item);

    // V2 Sprint 6 §11 — toute création (manuelle ou IA) écrit exactement une provenance ; la
    // déduplication (checklist-dedup.ts) en ajoute d'autres sur un item existant plutôt que d'en
    // créer un second, jamais de source supprimée.
    await this.sourceRepository.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      checklistItemId: item.id,
      findingType: command.source?.findingType,
      findingId: command.source?.findingId,
      sourceSuggestionId: command.source?.sourceSuggestionId,
      documentId: command.source?.documentId,
      documentVersionId: command.source?.documentVersionId,
      analysisVersion: command.source?.analysisVersion,
      pageStart: command.source?.pageStart,
      citation: command.source?.citation,
      sectionTitle: command.source?.sectionTitle,
      confidence: command.source?.confidence,
      createdAt: occurredAt,
    });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "tender.checklist_item_created",
      resourceType: "tender_checklist_item",
      resourceId: item.id,
      requestId: command.requestId,
      metadata: { tenderId: command.tenderId, type: item.type, origin: item.origin },
    });

    await this.outboxWriter.write({
      organizationId: command.organizationId,
      events: [
        {
          eventType: "ChecklistItemCreated",
          aggregateType: "TenderChecklistItem",
          aggregateId: item.id,
          payload: { tenderId: command.tenderId, itemId: item.id, type: item.type, origin: item.origin },
          occurredAt,
        },
      ],
    });

    return toChecklistItemSummary(item);
  }
}
