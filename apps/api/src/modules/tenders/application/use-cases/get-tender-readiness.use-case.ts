import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { TenderNotFoundError } from "../../domain/errors";
import { calculateTenderReadiness, type ReadinessResult } from "../../domain/readiness-calculator";
import { TenderPermission } from "../../domain/tender-permission";
import { ALERT_REPOSITORY, type AlertRepository } from "../ports/alert.repository";
import {
  AWARD_CRITERION_REPOSITORY,
  type AwardCriterionRepository,
} from "../ports/award-criterion.repository";
import {
  CHECKLIST_ITEM_REPOSITORY,
  type ChecklistItemRepository,
} from "../ports/checklist-item.repository";
import { MILESTONE_REPOSITORY, type MilestoneRepository } from "../ports/milestone.repository";
import {
  REQUESTED_DOCUMENT_REPOSITORY,
  type RequestedDocumentRepository,
} from "../ports/requested-document.repository";
import { RISK_REPOSITORY, type RiskRepository } from "../ports/risk.repository";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";

export type GetTenderReadinessQuery = Readonly<{ organizationId: string; tenderId: string; actorRole: string }>;

/**
 * Compose les 6 sous-ressources d'un Tender pour calculer un score déterministe
 * (mission §13). Le score reste informatif — voir avertissement porté par le presenter.
 */
@Injectable()
export class GetTenderReadinessUseCase {
  constructor(
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistRepository: ChecklistItemRepository,
    @Inject(REQUESTED_DOCUMENT_REPOSITORY) private readonly documentRepository: RequestedDocumentRepository,
    @Inject(AWARD_CRITERION_REPOSITORY) private readonly criterionRepository: AwardCriterionRepository,
    @Inject(MILESTONE_REPOSITORY) private readonly milestoneRepository: MilestoneRepository,
    @Inject(RISK_REPOSITORY) private readonly riskRepository: RiskRepository,
    @Inject(ALERT_REPOSITORY) private readonly alertRepository: AlertRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(query: GetTenderReadinessQuery): Promise<ReadinessResult> {
    assertHasTenderPermission(query.actorRole, TenderPermission.Read);

    const scope = { organizationId: query.organizationId, tenderId: query.tenderId };

    const tender = await this.tenderRepository.findById(scope);
    if (!tender) {
      throw new TenderNotFoundError();
    }

    const [checklistItems, requestedDocuments, criteria, milestones, risks, alerts] = await Promise.all([
      this.checklistRepository.listByTender(scope),
      this.documentRepository.listByTender(scope),
      this.criterionRepository.listByTender(scope),
      this.milestoneRepository.listByTender(scope),
      this.riskRepository.listByTender(scope),
      this.alertRepository.listByTender(scope),
    ]);

    return calculateTenderReadiness({
      checklistItems,
      requestedDocuments,
      criteria,
      milestones,
      risks,
      alerts,
      now: this.clock.now(),
    });
  }
}
