import { Inject, Injectable } from "@nestjs/common";
import { DCE_REPOSITORY, type DceRepository } from "../../../dce";
import { GetTenderUseCase } from "../../../tenders";
import { AnalysisPermission } from "../../domain/analysis-permission";
import { TenderBusinessAnalysisNotFoundError } from "../../domain/errors";
import { assertHasAnalysisPermission } from "../policies/analysis-authorization.policy";
import { BUSINESS_ANALYSIS_REPOSITORY, type BusinessAnalysisRepository, type TenderAnalysisSummaryRecord } from "../ports/business-analysis.repository";
import { computeAnalysisFreshness, type AnalysisFreshness } from "../../domain/analysis-freshness";

export type GetTenderBusinessAnalysisQuery = Readonly<{ organizationId: string; tenderId: string; actorRole: string; actorId: string }>;

/** Checkpoint 2.1-P2.1-FIX-A — `TenderAnalysisSummaryRecord` (déjà dotée de `dceRevision`, figé à
 *  la persistance) enrichie de la comparaison en LECTURE SEULE avec la révision DCE courante — même
 *  fonction pure `computeAnalysisFreshness` que `GetEffectiveTenderAnalysisSummaryUseCase`, jamais
 *  une seconde règle divergente. C'est ce endpoint (`GET .../analysis`), pas la version "effective"
 *  fusionnée avec les révisions utilisateur (usage interne GO/NO-GO uniquement), qui sert
 *  directement le frontend — mission §16/§17 "le frontend a besoin de cette information". */
export type TenderBusinessAnalysisWithFreshness = TenderAnalysisSummaryRecord & Readonly<{ analysisFreshness: AnalysisFreshness }>;

/**
 * Consultation de la synthèse métier consolidée la plus récente d'un tender (mission Sprint 4.2
 * §"GET .../analysis") — jamais le contenu du corpus source ni la réponse brute du provider,
 * uniquement la `TenderAnalysisSummary` déjà persistée (catégorie 8 "synthèse structurée",
 * recommandation go/no-go explicitement non contraignante).
 */
@Injectable()
export class GetTenderBusinessAnalysisUseCase {
  constructor(
    private readonly getTenderUseCase: GetTenderUseCase,
    @Inject(BUSINESS_ANALYSIS_REPOSITORY) private readonly businessAnalysisRepository: BusinessAnalysisRepository,
    @Inject(DCE_REPOSITORY) private readonly dceRepository: DceRepository,
  ) {}

  async execute(query: GetTenderBusinessAnalysisQuery): Promise<TenderBusinessAnalysisWithFreshness> {
    assertHasAnalysisPermission(query.actorRole, AnalysisPermission.Read);

    await this.getTenderUseCase.execute({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorRole: query.actorRole,
      actorId: query.actorId,
    });

    const summary = await this.businessAnalysisRepository.getLatestSummary({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
    });
    if (!summary) {
      throw new TenderBusinessAnalysisNotFoundError();
    }

    const dce = await this.dceRepository.findByTenderId({ organizationId: query.organizationId, tenderId: query.tenderId });
    return { ...summary, analysisFreshness: computeAnalysisFreshness(summary.dceRevision, dce?.revision) };
  }
}
