import { Inject, Injectable } from "@nestjs/common";
import { ChecklistComplianceStatus, ChecklistRequirementLevel, type ChecklistItem } from "../../domain/checklist-item.entity";
import { TenderPermission } from "../../domain/tender-permission";
import { CHECKLIST_ITEM_REPOSITORY, type ChecklistItemRepository } from "../ports/checklist-item.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";

export type ChecklistProgressCounts = Readonly<{
  totalApplicable: number;
  ready: number;
  validated: number;
  missing: number;
  blockingMissing: number;
  expired: number;
  toReview: number;
}>;

export type ChecklistProgress = Readonly<{
  global: ChecklistProgressCounts;
  byLot: Readonly<Record<string, ChecklistProgressCounts>>;
}>;

export type GetChecklistProgressQuery = Readonly<{ organizationId: string; tenderId: string; actorRole: string }>;

/** V2 Sprint 6 §23-24 — progression opérationnelle, distincte du score GO/NO-GO (Sprint 5, jamais
 *  recalculé ici). NOT_APPLICABLE et INFORMATIONAL exclus du dénominateur (mission §23 : un
 *  élément purement informatif ou non applicable ne porte aucune obligation de conformité). */
function computeCounts(items: readonly ChecklistItem[]): ChecklistProgressCounts {
  const applicable = items.filter(
    (item) => item.complianceStatus !== ChecklistComplianceStatus.NotApplicable && item.requirementLevel !== ChecklistRequirementLevel.Informational,
  );

  return {
    totalApplicable: applicable.length,
    ready: applicable.filter((item) => item.complianceStatus === ChecklistComplianceStatus.Ready).length,
    validated: applicable.filter((item) => item.complianceStatus === ChecklistComplianceStatus.Validated).length,
    missing: applicable.filter((item) => item.documentStatus === "MISSING").length,
    blockingMissing: applicable.filter((item) => item.criticality === "BLOCKING" && item.complianceStatus !== ChecklistComplianceStatus.Validated).length,
    expired: applicable.filter((item) => item.documentStatus === "EXPIRED").length,
    toReview: applicable.filter((item) => item.complianceStatus === ChecklistComplianceStatus.ToReview || item.complianceStatus === ChecklistComplianceStatus.NonCompliant).length,
  };
}

@Injectable()
export class GetChecklistProgressUseCase {
  constructor(
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistRepository: ChecklistItemRepository,
  ) {}

  async execute(query: GetChecklistProgressQuery): Promise<ChecklistProgress> {
    assertHasTenderPermission(query.actorRole, TenderPermission.Read);

    const items = await this.checklistRepository.listByTender({ organizationId: query.organizationId, tenderId: query.tenderId });

    const byLot: Record<string, ChecklistItem[]> = {};
    for (const item of items) {
      const key = item.lotId ?? "GLOBAL";
      (byLot[key] ??= []).push(item);
    }

    return {
      global: computeCounts(items),
      byLot: Object.fromEntries(Object.entries(byLot).map(([lotId, lotItems]) => [lotId, computeCounts(lotItems)])),
    };
  }
}
