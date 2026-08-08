import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase, ClientAccountArchivedError, ClientPermission, GetClientAccountUseCase } from "../../../client-portfolio";
import {
  assertHasTenderPermission,
  assertTenderMutationAllowed,
  CHECKLIST_ITEM_REPOSITORY,
  ChecklistComplianceStatus,
  loadChecklistItem,
  TENDER_REPOSITORY,
  TenderPermission,
  type ChecklistItemRepository,
  type TenderRepository,
} from "../../../tenders";
import { KnowledgeEntryPromotionRequiresValidatedChecklistItemError } from "../../domain/errors";
import { parseKnowledgeCategory } from "../../domain/knowledge-category";
import { KnowledgeEntry } from "../../domain/knowledge-entry.aggregate";
import { KnowledgeEntryVersion } from "../../domain/knowledge-entry-version.entity";
import { KnowledgePermission } from "../../domain/knowledge-permission";
import { KnowledgeSourceType } from "../../domain/knowledge-source-type";
import { assertHasKnowledgePermission } from "../policies/knowledge-authorization.policy";
import { KNOWLEDGE_ENTRY_REPOSITORY, type KnowledgeEntryRepository } from "../ports/knowledge-entry.repository";
import { validateKnowledgeMetadata } from "../schemas/metadata/metadata-validator";
import { toKnowledgeEntrySummary, type KnowledgeEntrySummary } from "../dtos";
import { GetOrCreateDefaultKnowledgeSpaceUseCase } from "./get-or-create-default-knowledge-space.use-case";

export type PromoteChecklistItemToKnowledgeCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  itemId: string;
  actorId: string;
  actorRole: string;
  /** Mission §19/§53 — jamais un titre/une catégorie/un scope hérités silencieusement : l'utilisateur
   *  les choisit explicitement à chaque promotion, même si le titre proposé par défaut à l'écran
   *  reprend celui de l'item (décision côté frontend, jamais côté use case). */
  title: string;
  category: string;
  description?: string | undefined;
  metadata?: unknown;
  tags?: readonly string[] | undefined;
  clientAccountId?: string | undefined;
  requestId?: string | undefined;
}>;

/**
 * Promotion gouvernée d'un `ChecklistItem` validé (Sprint 6) vers une nouvelle `KnowledgeEntry`
 * (mission V2 Sprint 8 §19 "mécanisme de promotion... jamais silencieux, toujours une confirmation
 * explicite de l'utilisateur" — décision d'architecture §7 du plan). Copie le contenu textuel
 * (titre/description fournis explicitement par l'utilisateur, jamais imposés) en une entrée MANUEL ;
 * si l'item porte un document rapproché, son identité est conservée comme PROVENANCE (jamais une
 * réimportation/réextraction — mission §12 "ne pas dupliquer Document/DocumentVersion").
 * N'HÉRITE JAMAIS la confiance : la nouvelle entrée démarre READY mais non validée (mission §16) —
 * une promotion n'est pas une validation.
 */
@Injectable()
export class PromoteChecklistItemToKnowledgeUseCase {
  constructor(
    @Inject(KNOWLEDGE_ENTRY_REPOSITORY) private readonly knowledgeEntryRepository: KnowledgeEntryRepository,
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistItemRepository: ChecklistItemRepository,
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly getOrCreateDefaultKnowledgeSpaceUseCase: GetOrCreateDefaultKnowledgeSpaceUseCase,
    private readonly getClientAccountUseCase: GetClientAccountUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: PromoteChecklistItemToKnowledgeCommand): Promise<KnowledgeEntrySummary> {
    // Côté source (Tenders) : l'acteur doit pouvoir gérer la checklist de CE Tender.
    assertHasTenderPermission(command.actorRole, TenderPermission.ManageChecklist);
    // Côté destination (Knowledge Base) : l'acteur doit pouvoir créer une entrée.
    assertHasKnowledgePermission(command.actorRole, KnowledgePermission.Create);

    // Correctif audit Codex P1-01 — `ManageChecklist` est un palier ORGANISATION, jamais suffisant
    // seul (mission §5/§63/§64) : un membre de l'organisation sans affectation CLIENT réelle sur le
    // client PROPRIÉTAIRE de ce Tender ne doit jamais pouvoir capitaliser son contenu, même avec un
    // itemId/tenderId valides. Même garde que chaque use case checklist réel
    // (`ValidateChecklistItemUseCase`, etc.) — jamais un `findUnique` nu suivi d'une simple
    // vérification de permission organisation.
    await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);

    // Anti-IDOR (mission §44) — jamais un `findUnique({id})` nu : l'item doit appartenir à CE
    // Tender ET à cette organisation, sinon `ChecklistItemNotFoundError`.
    const item = await loadChecklistItem(this.checklistItemRepository, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      itemId: command.itemId,
    });

    // Mission §19/Décision 7 — seule une décision humaine explicite déjà actée (VALIDATED) peut
    // être capitalisée ; jamais un contenu encore TO_REVIEW/NON_COMPLIANT/READY (non confirmé).
    if (item.complianceStatus !== ChecklistComplianceStatus.Validated) {
      throw new KnowledgeEntryPromotionRequiresValidatedChecklistItemError({ status: item.complianceStatus });
    }

    if (command.clientAccountId) {
      const client = await this.getClientAccountUseCase.execute({
        organizationId: command.organizationId,
        clientAccountId: command.clientAccountId,
        actorId: command.actorId,
        actorRole: command.actorRole,
      });
      if (client.status === "ARCHIVED") {
        throw new ClientAccountArchivedError();
      }
      await this.assertClientAccessUseCase.execute({
        organizationId: command.organizationId,
        clientAccountId: command.clientAccountId,
        actorId: command.actorId,
        actorRole: command.actorRole,
        permission: ClientPermission.ManageKnowledge,
      });
    }

    const category = parseKnowledgeCategory(command.category);
    const metadata = validateKnowledgeMetadata(category, command.metadata ?? {});
    const space = await this.getOrCreateDefaultKnowledgeSpaceUseCase.getOrCreate(command.organizationId);
    const occurredAt = this.clock.now();

    const entry = KnowledgeEntry.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      knowledgeSpaceId: space.id,
      clientAccountId: command.clientAccountId,
      title: command.title,
      description: command.description,
      category,
      sourceType: KnowledgeSourceType.Manual,
      metadata,
      // Provenance (mission §17/§18) — renseignée UNIQUEMENT ici, jamais modifiable ensuite (voir
      // l'agrégat) : si l'item portait un document rapproché, son IDENTITÉ est conservée comme
      // référence historique, jamais réimportée/réextraite (mission §12).
      sourceTenderId: command.tenderId,
      sourceChecklistItemId: command.itemId,
      sourceDocumentId: item.matchedDocumentId,
      sourceDocumentVersionId: item.matchedDocumentVersionId,
      promotedByUserId: command.actorId,
      promotedAt: occurredAt,
      createdByUserId: command.actorId,
      occurredAt,
    });

    const version = KnowledgeEntryVersion.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      knowledgeEntryId: entry.id,
      versionNumber: 1,
      reason: `Promue depuis l'item de checklist « ${item.title} »`,
      snapshot: { title: entry.title, description: entry.description, category: entry.category, language: entry.language, metadata: entry.metadata },
      createdByUserId: command.actorId,
      occurredAt,
    });

    const { tags } = await this.knowledgeEntryRepository.createWithVersionAndTags({
      entry,
      version,
      tagLabels: (command.tags ?? []).map((rawLabel) => ({ label: rawLabel, displayLabel: rawLabel.trim() })),
      occurredAt,
      auditEntry: {
        organizationId: command.organizationId,
        actorType: "USER",
        actorId: command.actorId,
        action: "knowledge_entry.promoted_from_tender",
        resourceType: "knowledge_entry",
        resourceId: entry.id,
        requestId: command.requestId,
        metadata: { category, clientAccountId: command.clientAccountId, sourceTenderId: command.tenderId, sourceChecklistItemId: command.itemId },
      },
      outboxEvents: [
        {
          eventType: "KnowledgeEntryPromotedFromTender",
          aggregateType: "KnowledgeEntry",
          aggregateId: entry.id,
          payload: { sourceTenderId: command.tenderId, sourceChecklistItemId: command.itemId, category },
          occurredAt,
        },
      ],
    });

    return toKnowledgeEntrySummary(entry, tags, 0);
  }
}
