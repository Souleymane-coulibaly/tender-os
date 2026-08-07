import { Inject, Injectable } from "@nestjs/common";
import {
  TENDER_ANALYSIS_SUMMARY_REVISION_REPOSITORY,
  type TenderAnalysisSummaryRevisionRepository,
} from "../ports/tender-analysis-summary-revision.repository";
import type { TenderAnalysisSummaryRecord } from "../ports/business-analysis.repository";
import { GetTenderBusinessAnalysisUseCase, type GetTenderBusinessAnalysisQuery } from "./get-tender-business-analysis.use-case";

export type EffectiveTenderAnalysisSummary = Readonly<{
  id: string;
  analysisVersion: number;
  opportunitySummary: string;
  complexityLevel: string;
  mainCriteria: readonly string[];
  mainRisks: readonly string[];
  mainObligations: readonly string[];
  missingElements: readonly string[];
  pointsToClarify: readonly string[];
  conflicts: unknown;
  /** JAMAIS révisables par l'utilisateur (le modèle `TenderAnalysisSummaryRevision` ne porte pas
   *  ces deux champs) — toujours la valeur d'origine de l'IA, quelle que soit la révision. */
  goNoGoRecommendation: string;
  goNoGoRationale: string;
  createdAt: string;
  /** `true` si au moins une révision utilisateur a été appliquée par-dessus le résumé d'origine. */
  hasUserRevision: boolean;
}>;

/**
 * V2 Sprint 5 (GO/NO-GO IA) — fusionne `TenderAnalysisSummary` (résultat IA d'origine, Sprint 4.2)
 * avec la DERNIÈRE `TenderAnalysisSummaryRevision` (correction utilisateur, Sprint 4) : les champs
 * non-null de la révision la plus récente l'emportent, jamais les révisions plus anciennes
 * (`revisions[0]`, déjà trié "la plus récente en premier" par le repository — voir sa
 * documentation), jamais une fusion cumulative à travers l'historique complet.
 *
 * Sert AUSSI de porte d'entrée Niveau 2 (mission GO/NO-GO §12) : si aucune analyse n'a encore
 * réussi pour ce tender, `GetTenderBusinessAnalysisUseCase` lève `TenderBusinessAnalysisNotFoundError`
 * — la seule présence d'une `TenderAnalysisSummary` prouve que le job a atteint SUCCEEDED/
 * PARTIALLY_SUCCEEDED (voir le commentaire de `BusinessAnalysisRepository.getLatestSummary`).
 *
 * Ajouté dans `analysis` (plutôt que dupliqué dans `opportunity`) car c'est une fusion en LECTURE
 * SEULE des deux tables que ce module possède déjà — aucune dépendance à un concept Sprint 5,
 * réutilisable par tout futur consommateur de "l'analyse effective actuelle" d'un tender.
 */
@Injectable()
export class GetEffectiveTenderAnalysisSummaryUseCase {
  constructor(
    private readonly getTenderBusinessAnalysisUseCase: GetTenderBusinessAnalysisUseCase,
    @Inject(TENDER_ANALYSIS_SUMMARY_REVISION_REPOSITORY)
    private readonly revisionRepository: TenderAnalysisSummaryRevisionRepository,
  ) {}

  async execute(query: GetTenderBusinessAnalysisQuery): Promise<EffectiveTenderAnalysisSummary> {
    const base = await this.getTenderBusinessAnalysisUseCase.execute(query);

    const revisions = await this.revisionRepository.listByBaseSummaryId({
      organizationId: query.organizationId,
      baseSummaryId: base.id,
    });
    const latestRevision = revisions[0];

    return this.merge(base, latestRevision);
  }

  private merge(
    base: TenderAnalysisSummaryRecord,
    latestRevision: Awaited<ReturnType<TenderAnalysisSummaryRevisionRepository["listByBaseSummaryId"]>>[number] | undefined,
  ): EffectiveTenderAnalysisSummary {
    if (!latestRevision) {
      return { ...base, hasUserRevision: false };
    }

    return {
      id: base.id,
      analysisVersion: base.analysisVersion,
      opportunitySummary: latestRevision.opportunitySummary ?? base.opportunitySummary,
      complexityLevel: latestRevision.complexityLevel ?? base.complexityLevel,
      mainCriteria: latestRevision.mainCriteria ?? base.mainCriteria,
      mainRisks: latestRevision.mainRisks ?? base.mainRisks,
      mainObligations: latestRevision.mainObligations ?? base.mainObligations,
      missingElements: latestRevision.missingElements ?? base.missingElements,
      pointsToClarify: latestRevision.pointsToClarify ?? base.pointsToClarify,
      conflicts: latestRevision.conflicts ?? base.conflicts,
      goNoGoRecommendation: base.goNoGoRecommendation,
      goNoGoRationale: base.goNoGoRationale,
      createdAt: base.createdAt,
      hasUserRevision: true,
    };
  }
}
