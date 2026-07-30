import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { ListAccessibleClientsUseCase } from "../../../client-portfolio";
import { TenderPermission } from "../../domain/tender-permission";
import { TenderStatus } from "../../domain/tender-status";
import { toTenderBoardItemDto, type TenderBoardDto } from "../board-dtos";
import { ALERT_REPOSITORY, type AlertRepository } from "../ports/alert.repository";
import { AWARD_CRITERION_REPOSITORY, type AwardCriterionRepository } from "../ports/award-criterion.repository";
import { CHECKLIST_ITEM_REPOSITORY, type ChecklistItemRepository } from "../ports/checklist-item.repository";
import { MILESTONE_REPOSITORY, type MilestoneRepository } from "../ports/milestone.repository";
import {
  REQUESTED_DOCUMENT_REPOSITORY,
  type RequestedDocumentRepository,
} from "../ports/requested-document.repository";
import { RISK_REPOSITORY, type RiskRepository } from "../ports/risk.repository";
import { TENDER_SEARCH_PROVIDER, type TenderSearchProvider } from "../ports/tender-search-provider";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";
import { enrichTenders } from "../tender-enrichment";

export type GetTenderBoardQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  search?: string | undefined;
  internalOwnerId?: string | undefined;
  clientAccountId?: string | undefined;
  limitPerColumn?: number | undefined;
}>;

const DEFAULT_LIMIT_PER_COLUMN = 50;

/** Colonnes actives du Kanban — ARCHIVED est un statut terminal retiré du pilotage actif
 *  (mission Kanban & List Views §3 : le board reflète le pipeline en cours, pas l'historique
 *  clos ; un Tender archivé reste consultable via la vue Liste avec le filtre statut). */
const BOARD_STATUSES: readonly TenderStatus[] = Object.values(TenderStatus).filter(
  (status) => status !== TenderStatus.Archived,
);

/**
 * Projection en lecture seule du module Tenders (mission Kanban & List Views §2) : aucune
 * règle métier ici, uniquement de la composition de requêtes déjà bornées (une par colonne,
 * plus un lot de requêtes groupées par sous-ressource pour les cartes réellement affichées)
 * afin d'éviter tout N+1 proportionnel au nombre de Tenders.
 */
@Injectable()
export class GetTenderBoardUseCase {
  constructor(
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistRepository: ChecklistItemRepository,
    @Inject(REQUESTED_DOCUMENT_REPOSITORY) private readonly documentRepository: RequestedDocumentRepository,
    @Inject(AWARD_CRITERION_REPOSITORY) private readonly criterionRepository: AwardCriterionRepository,
    @Inject(MILESTONE_REPOSITORY) private readonly milestoneRepository: MilestoneRepository,
    @Inject(RISK_REPOSITORY) private readonly riskRepository: RiskRepository,
    @Inject(ALERT_REPOSITORY) private readonly alertRepository: AlertRepository,
    @Inject(TENDER_SEARCH_PROVIDER) private readonly searchProvider: TenderSearchProvider,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly listAccessibleClientsUseCase: ListAccessibleClientsUseCase,
  ) {}

  async execute(query: GetTenderBoardQuery): Promise<TenderBoardDto> {
    assertHasTenderPermission(query.actorRole, TenderPermission.List);

    const accessible = await this.listAccessibleClientsUseCase.execute(query);
    if (!accessible.allClients && accessible.clientAccountIds.length === 0) {
      return { columns: BOARD_STATUSES.map((status) => ({ status, totalCount: 0, items: [] })) };
    }

    const limitPerColumn = query.limitPerColumn ?? DEFAULT_LIMIT_PER_COLUMN;
    const idsFilter = query.search
      ? await this.searchProvider.findMatchingTenderIds({ organizationId: query.organizationId, query: query.search })
      : undefined;

    if (idsFilter && idsFilter.length === 0) {
      return { columns: BOARD_STATUSES.map((status) => ({ status, totalCount: 0, items: [] })) };
    }

    const baseFilter = {
      organizationId: query.organizationId,
      internalOwnerId: query.internalOwnerId,
      clientAccountId: query.clientAccountId,
      restrictToClientAccountIds: accessible.allClients ? undefined : accessible.clientAccountIds,
      idsFilter,
    };

    const columnsData = await Promise.all(
      BOARD_STATUSES.map(async (status) => {
        const [totalCount, page] = await Promise.all([
          this.tenderRepository.count({ ...baseFilter, status }),
          this.tenderRepository.list({
            ...baseFilter,
            status,
            limit: limitPerColumn,
            sort: "submissionDeadline",
            sortDirection: "asc",
          }),
        ]);
        return { status, totalCount, tenders: page.items };
      }),
    );

    const allTenders = columnsData.flatMap((column) => column.tenders);
    const tenderIds = allTenders.map((tender) => tender.id.value);

    const [checklistItems, requestedDocuments, criteria, milestones, risks, alerts] = await Promise.all([
      this.checklistRepository.listByTenderIds({ organizationId: query.organizationId, tenderIds }),
      this.documentRepository.listByTenderIds({ organizationId: query.organizationId, tenderIds }),
      this.criterionRepository.listByTenderIds({ organizationId: query.organizationId, tenderIds }),
      this.milestoneRepository.listByTenderIds({ organizationId: query.organizationId, tenderIds }),
      this.riskRepository.listByTenderIds({ organizationId: query.organizationId, tenderIds }),
      this.alertRepository.listByTenderIds({ organizationId: query.organizationId, tenderIds }),
    ]);

    const enrichment = enrichTenders({
      tenders: allTenders,
      checklistItems,
      requestedDocuments,
      criteria,
      milestones,
      risks,
      alerts,
      now: this.clock.now(),
    });

    return {
      columns: columnsData.map((column) => ({
        status: column.status,
        totalCount: column.totalCount,
        items: column.tenders.map((tender) => toTenderBoardItemDto(tender, enrichment.get(tender.id.value)!)),
      })),
    };
  }
}
