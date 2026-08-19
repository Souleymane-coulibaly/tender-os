import { Inject, Injectable } from "@nestjs/common";
import { GetTenderBusinessAnalysisUseCase, TenderBusinessAnalysisNotFoundError, type AnalysisFreshness } from "../../../analysis";
import {
  CHECKLIST_RECONCILIATION_REPOSITORY,
  ChecklistFreshness,
  GetTenderUseCase,
  computeChecklistFreshness,
  type ChecklistReconciliationRepository,
} from "../../../tenders";

export type GetChecklistFreshnessQuery = Readonly<{ organizationId: string; tenderId: string; actorId: string; actorRole: string }>;

export type ChecklistFreshnessResult = Readonly<{
  analysisVersion: number | undefined;
  analysisFreshness: AnalysisFreshness | undefined;
  lastReconciledAnalysisVersion: number | undefined;
  checklistFreshness: ChecklistFreshness;
}>;

/**
 * Checkpoint 2.1-P2.1-FIX-B (mission §26-27/§31) — lecture seule, jamais un déclenchement de
 * reconcile. Distingue explicitement DEUX signaux que le frontend ne doit jamais conflater (mission
 * §28-31) : `analysisFreshness` ("l'analyse elle-même est-elle à jour par rapport au DCE ?", déjà
 * exposé par `GetTenderBusinessAnalysisUseCase` depuis FIX-A) et `checklistFreshness` ("la Checklist
 * a-t-elle été réconciliée contre la DERNIÈRE analyse ?", nouveau ici) — une Checklist peut avoir
 * besoin d'une réconciliation même quand l'analyse est déjà CURRENT (personne n'a encore relancé le
 * reconcile). Aucune analyse n'ayant jamais réussi -> les deux signaux restent `undefined`/
 * `RECONCILIATION_REQUIRED`, jamais une erreur 404 (contrairement à `GET .../analysis` lui-même) :
 * l'onglet Checklist doit pouvoir s'afficher même avant la première analyse.
 */
@Injectable()
export class GetChecklistFreshnessUseCase {
  constructor(
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly getTenderBusinessAnalysisUseCase: GetTenderBusinessAnalysisUseCase,
    @Inject(CHECKLIST_RECONCILIATION_REPOSITORY) private readonly reconciliationRepository: ChecklistReconciliationRepository,
  ) {}

  async execute(query: GetChecklistFreshnessQuery): Promise<ChecklistFreshnessResult> {
    await this.getTenderUseCase.execute({ organizationId: query.organizationId, tenderId: query.tenderId, actorRole: query.actorRole, actorId: query.actorId });

    let analysisVersion: number | undefined;
    let analysisFreshness: AnalysisFreshness | undefined;
    try {
      const analysis = await this.getTenderBusinessAnalysisUseCase.execute({
        organizationId: query.organizationId,
        tenderId: query.tenderId,
        actorId: query.actorId,
        actorRole: query.actorRole,
      });
      analysisVersion = analysis.analysisVersion;
      analysisFreshness = analysis.analysisFreshness;
    } catch (error) {
      if (!(error instanceof TenderBusinessAnalysisNotFoundError)) throw error;
    }

    const reconciliationState = await this.reconciliationRepository.find({ organizationId: query.organizationId, tenderId: query.tenderId });

    return {
      analysisVersion,
      analysisFreshness,
      lastReconciledAnalysisVersion: reconciliationState?.lastReconciledAnalysisVersion,
      // Correctif audit P1-FIXB-001 — une Checklist réconciliée contre la dernière `analysisVersion`
      // ne peut être `CURRENT` que si CETTE analyse est elle-même `CURRENT` vis-à-vis du DCE. Sinon,
      // la réconciliation s'est appuyée sur des `Finding`s déjà obsolètes : jamais un faux "à jour".
      checklistFreshness: computeChecklistFreshness(analysisVersion, reconciliationState?.lastReconciledAnalysisVersion, analysisFreshness === "CURRENT"),
    };
  }
}
