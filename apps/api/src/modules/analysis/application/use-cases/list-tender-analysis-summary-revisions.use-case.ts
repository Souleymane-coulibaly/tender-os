import { Inject, Injectable } from "@nestjs/common";
import { GetTenderUseCase } from "../../../tenders";
import { AnalysisPermission } from "../../domain/analysis-permission";
import { assertHasAnalysisPermission } from "../policies/analysis-authorization.policy";
import { BUSINESS_ANALYSIS_REPOSITORY, type BusinessAnalysisRepository } from "../ports/business-analysis.repository";
import {
  TENDER_ANALYSIS_SUMMARY_REVISION_REPOSITORY,
  type TenderAnalysisSummaryRevisionRecord,
  type TenderAnalysisSummaryRevisionRepository,
} from "../ports/tender-analysis-summary-revision.repository";

export type ListTenderAnalysisSummaryRevisionsQuery = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
}>;

/**
 * V2 Sprint 4 — historique complet des révisions utilisateur de la synthèse IA la plus récente
 * (jamais filtré, la plus récente révision en premier) — `[]` si la synthèse n'a encore jamais été
 * révisée OU si aucune synthèse n'existe encore, jamais une erreur ici : c'est à l'appelant de
 * décider si une liste vide est une réponse valide (même motif que `resolveLatestAnalysisVersion`).
 */
@Injectable()
export class ListTenderAnalysisSummaryRevisionsUseCase {
  constructor(
    private readonly getTenderUseCase: GetTenderUseCase,
    @Inject(BUSINESS_ANALYSIS_REPOSITORY) private readonly businessAnalysisRepository: BusinessAnalysisRepository,
    @Inject(TENDER_ANALYSIS_SUMMARY_REVISION_REPOSITORY) private readonly revisionRepository: TenderAnalysisSummaryRevisionRepository,
  ) {}

  async execute(query: ListTenderAnalysisSummaryRevisionsQuery): Promise<TenderAnalysisSummaryRevisionRecord[]> {
    assertHasAnalysisPermission(query.actorRole, AnalysisPermission.Read);

    await this.getTenderUseCase.execute({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
    });

    const baseSummary = await this.businessAnalysisRepository.getLatestSummary({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
    });
    if (!baseSummary) {
      return [];
    }

    return this.revisionRepository.listByBaseSummaryId({ organizationId: query.organizationId, baseSummaryId: baseSummary.id });
  }
}
