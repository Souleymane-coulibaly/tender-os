import { Inject, Injectable } from "@nestjs/common";
import { TenderPermission } from "../../domain/tender-permission";
import { toChecklistItemSummary, type ChecklistItemSummary } from "../dtos";
import {
  CHECKLIST_ITEM_REPOSITORY,
  type ChecklistItemRepository,
} from "../ports/checklist-item.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";

export type ListChecklistItemsQuery = Readonly<{
  organizationId: string;
  tenderId: string;
  actorRole: string;
  lotId?: string | undefined;
  complianceStatus?: string | undefined;
  criticality?: string | undefined;
  requirementLevel?: string | undefined;
  subjectType?: string | undefined;
  blockingOnly?: boolean | undefined;
  missingOnly?: boolean | undefined;
  expiredOnly?: boolean | undefined;
}>;

@Injectable()
export class ListChecklistItemsUseCase {
  constructor(
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistRepository: ChecklistItemRepository,
  ) {}

  async execute(query: ListChecklistItemsQuery): Promise<ChecklistItemSummary[]> {
    assertHasTenderPermission(query.actorRole, TenderPermission.Read);

    const items = await this.checklistRepository.listByTender({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
    });

    // V2 Sprint 6 §26-29 — filtres appliqués ici (jamais côté frontend seul, mission §30) ; le
    // volume attendu (~100 items, mission §42) rend un filtrage en mémoire acceptable sans
    // sur-indexer chaque combinaison en base.
    const filtered = items.filter((item) => {
      if (query.lotId !== undefined && item.lotId !== query.lotId) return false;
      if (query.complianceStatus !== undefined && item.complianceStatus !== query.complianceStatus) return false;
      if (query.criticality !== undefined && item.criticality !== query.criticality) return false;
      if (query.requirementLevel !== undefined && item.requirementLevel !== query.requirementLevel) return false;
      if (query.subjectType !== undefined && item.subjectType !== query.subjectType) return false;
      if (query.blockingOnly && item.criticality !== "BLOCKING") return false;
      if (query.missingOnly && item.documentStatus !== "MISSING") return false;
      if (query.expiredOnly && item.documentStatus !== "EXPIRED") return false;
      return true;
    });

    return filtered.sort((a, b) => a.displayOrder - b.displayOrder).map(toChecklistItemSummary);
  }
}
