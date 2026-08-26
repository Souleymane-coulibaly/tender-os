import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { TenderNotFoundError } from "../../domain/errors";
import { calculateTenderReadiness, type ReadinessResult, type TenderAnalysisReadinessState } from "../../domain/readiness-calculator";
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
import {
  TENDER_ANALYSIS_STATE_PROVIDER,
  type TenderAnalysisStateProvider,
} from "../ports/tender-analysis-state-provider";

export type GetTenderReadinessQuery = Readonly<{ organizationId: string; tenderId: string; actorRole: string; actorId: string }>;

/**
 * Compose les 6 sous-ressources d'un Tender pour calculer un score déterministe
 * (mission §13). Le score reste informatif — voir avertissement porté par le presenter.
 */
@Injectable()
export class GetTenderReadinessUseCase {
  private readonly logger = new Logger(GetTenderReadinessUseCase.name);

  constructor(
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistRepository: ChecklistItemRepository,
    @Inject(REQUESTED_DOCUMENT_REPOSITORY) private readonly documentRepository: RequestedDocumentRepository,
    @Inject(AWARD_CRITERION_REPOSITORY) private readonly criterionRepository: AwardCriterionRepository,
    @Inject(MILESTONE_REPOSITORY) private readonly milestoneRepository: MilestoneRepository,
    @Inject(RISK_REPOSITORY) private readonly riskRepository: RiskRepository,
    @Inject(ALERT_REPOSITORY) private readonly alertRepository: AlertRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    // `@Optional()` défensif uniquement : sans le pont, l'état reste `UNKNOWN` — jamais READY.
    // Un score de préparation absent de sa dépendance doit être conservateur, jamais optimiste.
    @Optional() @Inject(TENDER_ANALYSIS_STATE_PROVIDER) private readonly analysisStateProvider?: TenderAnalysisStateProvider,
  ) {}

  async execute(query: GetTenderReadinessQuery): Promise<ReadinessResult> {
    assertHasTenderPermission(query.actorRole, TenderPermission.Read);

    const scope = { organizationId: query.organizationId, tenderId: query.tenderId };

    const tender = await this.tenderRepository.findById(scope);
    if (!tender) {
      throw new TenderNotFoundError();
    }

    const [checklistItems, requestedDocuments, criteria, milestones, risks, alerts, analysis, pendingMandatoryRequirements] = await Promise.all([
      this.checklistRepository.listByTender(scope),
      this.documentRepository.listByTender(scope),
      this.criterionRepository.listByTender(scope),
      this.milestoneRepository.listByTender(scope),
      this.riskRepository.listByTender(scope),
      this.alertRepository.listByTender(scope),
      this.resolveAnalysisState({ ...scope, actorRole: query.actorRole, actorId: query.actorId }),
      this.countPendingMandatoryRequirements({ ...scope, actorRole: query.actorRole, actorId: query.actorId }),
    ]);

    return calculateTenderReadiness({
      checklistItems,
      requestedDocuments,
      criteria,
      milestones,
      risks,
      alerts,
      analysis,
      pendingMandatoryRequirements,
      now: this.clock.now(),
    });
  }

  /**
   * Checkpoint TENDEROS-2.1-POST-DECOM-TNR-FIX-1 (F-02) — consomme le contrat PUBLIC d'Analysis,
   * exactement celui que la readiness de DÉPÔT utilise déjà (`GetTenderSubmissionReadinessUseCase`) :
   * une seule SOT de fraîcheur, jamais un second calcul divergent.
   *
   * L'absence d'analyse (`TenderBusinessAnalysisNotFoundError`) est un état métier normal, pas une
   * erreur à propager. Toute autre défaillance est traitée en `UNKNOWN` — conservateur par
   * construction : un score de préparation ne doit jamais devenir optimiste parce qu'une dépendance
   * n'a pas pu être interrogée.
   */
  /** F-06 — conservateur : si le comptage echoue, on considere l'incertitude MAXIMALE (1), jamais 0. */
  private async countPendingMandatoryRequirements(input: { organizationId: string; tenderId: string; actorRole: string; actorId: string }): Promise<number> {
    if (!this.analysisStateProvider) return 1;
    try {
      return await this.analysisStateProvider.countPendingMandatoryRequirements(input);
    } catch (error) {
      this.logger.warn(`Readiness: pending mandatory requirements could not be counted for ${input.tenderId}: ${error instanceof Error ? error.message : String(error)}`);
      return 1;
    }
  }

  private async resolveAnalysisState(input: {
    organizationId: string;
    tenderId: string;
    actorRole: string;
    actorId: string;
  }): Promise<TenderAnalysisReadinessState> {
    if (!this.analysisStateProvider) return "UNKNOWN";
    try {
      return await this.analysisStateProvider.getState(input);
    } catch (error) {
      // Conservateur par construction : une dépendance injoignable ne doit jamais rendre le score
      // optimiste (F-02). Loggé en warn, jamais silencieux, jamais propagé à l'appelant.
      this.logger.warn(
        `Readiness: tender analysis state could not be resolved for ${input.tenderId}, treated as UNKNOWN: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      return "UNKNOWN";
    }
  }
}
