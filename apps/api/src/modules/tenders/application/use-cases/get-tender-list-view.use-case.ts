import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { TenderStatus } from "../../domain/tender-status";
import { TenderPermission } from "../../domain/tender-permission";
import { toTenderListItemDto, type TenderListItemDto } from "../board-dtos";
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

export type GetTenderListViewQuery = Readonly<{
  organizationId: string;
  actorRole: string;
  cursor?: string | undefined;
  limit: number;
  status?: TenderStatus | undefined;
  internalOwnerId?: string | undefined;
  search?: string | undefined;
  deadlineAfter?: string | undefined;
  deadlineBefore?: string | undefined;
  overdue?: boolean | undefined;
  sort?: "createdAt" | "submissionDeadline" | "title" | "updatedAt" | undefined;
  sortDirection?: "asc" | "desc" | undefined;
}>;

export type GetTenderListViewResult = Readonly<{ items: readonly TenderListItemDto[]; nextCursor: string | null }>;

/**
 * Même filtrage/tri/pagination que ListTendersUseCase (réutilise les mêmes ports —
 * TenderRepository, TenderSearchProvider — plutôt que de dupliquer une règle métier),
 * mais enrichit chaque ligne avec les indicateurs de pilotage attendus par la vue Liste
 * (mission §5 : score de préparation, risques ouverts, checklist, retard).
 */
@Injectable()
export class GetTenderListViewUseCase {
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
  ) {}

  async execute(query: GetTenderListViewQuery): Promise<GetTenderListViewResult> {
    assertHasTenderPermission(query.actorRole, TenderPermission.List);

    const idsFilter = query.search
      ? await this.searchProvider.findMatchingTenderIds({ organizationId: query.organizationId, query: query.search })
      : undefined;

    const page = await this.tenderRepository.list({
      organizationId: query.organizationId,
      cursor: query.cursor,
      limit: query.limit,
      status: query.status,
      internalOwnerId: query.internalOwnerId,
      idsFilter,
      deadlineAfter: query.deadlineAfter ? new Date(query.deadlineAfter) : undefined,
      deadlineBefore: query.deadlineBefore ? new Date(query.deadlineBefore) : undefined,
      overdue: query.overdue,
      sort: query.sort,
      sortDirection: query.sortDirection,
    });

    const tenderIds = page.items.map((tender) => tender.id.value);

    const [checklistItems, requestedDocuments, criteria, milestones, risks, alerts] = await Promise.all([
      this.checklistRepository.listByTenderIds({ organizationId: query.organizationId, tenderIds }),
      this.documentRepository.listByTenderIds({ organizationId: query.organizationId, tenderIds }),
      this.criterionRepository.listByTenderIds({ organizationId: query.organizationId, tenderIds }),
      this.milestoneRepository.listByTenderIds({ organizationId: query.organizationId, tenderIds }),
      this.riskRepository.listByTenderIds({ organizationId: query.organizationId, tenderIds }),
      this.alertRepository.listByTenderIds({ organizationId: query.organizationId, tenderIds }),
    ]);

    const enrichment = enrichTenders({
      tenders: page.items,
      checklistItems,
      requestedDocuments,
      criteria,
      milestones,
      risks,
      alerts,
      now: this.clock.now(),
    });

    return {
      items: page.items.map((tender) => toTenderListItemDto(tender, enrichment.get(tender.id.value)!)),
      nextCursor: page.nextCursor,
    };
  }
}
