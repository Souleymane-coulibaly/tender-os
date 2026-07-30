import { Inject, Injectable } from "@nestjs/common";
import { GetTenderUseCase } from "../../../tenders";
import { AnalysisPermission } from "../../domain/analysis-permission";
import { TenderBusinessAnalysisNotFoundError } from "../../domain/errors";
import { assertHasAnalysisPermission } from "../policies/analysis-authorization.policy";
import { BUSINESS_ANALYSIS_REPOSITORY, type BusinessAnalysisRepository, type TenderAnalysisSummaryRecord } from "../ports/business-analysis.repository";

export type GetTenderBusinessAnalysisQuery = Readonly<{ organizationId: string; tenderId: string; actorRole: string; actorId: string }>;

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
  ) {}

  async execute(query: GetTenderBusinessAnalysisQuery): Promise<TenderAnalysisSummaryRecord> {
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

    return summary;
  }
}
