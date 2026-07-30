import { Inject, Injectable } from "@nestjs/common";
import { GetTenderUseCase } from "../../../tenders";
import { AnalysisPermission } from "../../domain/analysis-permission";
import { AnalysisScope } from "../../domain/analysis-scope";
import { assertHasAnalysisPermission } from "../policies/analysis-authorization.policy";
import { ANALYSIS_JOB_REPOSITORY, type AnalysisJobRepository } from "../ports/analysis-job.repository";
import { toAnalysisJobSummary, type AnalysisJobSummary } from "../dtos";

export type ListTenderAnalysesQuery = Readonly<{
  organizationId: string;
  tenderId: string;
  actorRole: string;
  limit: number;
  offset: number;
}>;

export type ListTenderAnalysesResult = Readonly<{ items: readonly AnalysisJobSummary[]; total: number; limit: number; offset: number }>;

/**
 * Historique des versions d'analyse Tender (mission Sprint 4.2 §"GET .../analyses") — toutes les
 * versions confondues (SUCCEEDED/PARTIALLY_SUCCEEDED/FAILED/CANCELLED), la plus récente d'abord ;
 * jamais filtré, jamais silencieusement réduit à la seule dernière réussie (voir
 * `GetTenderBusinessAnalysisUseCase` pour cette consultation-là).
 */
@Injectable()
export class ListTenderAnalysesUseCase {
  constructor(
    private readonly getTenderUseCase: GetTenderUseCase,
    @Inject(ANALYSIS_JOB_REPOSITORY) private readonly jobRepository: AnalysisJobRepository,
  ) {}

  async execute(query: ListTenderAnalysesQuery): Promise<ListTenderAnalysesResult> {
    assertHasAnalysisPermission(query.actorRole, AnalysisPermission.Read);

    await this.getTenderUseCase.execute({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorRole: query.actorRole,
    });

    const page = await this.jobRepository.listByTarget({
      organizationId: query.organizationId,
      scope: AnalysisScope.Tender,
      targetId: query.tenderId,
      limit: query.limit,
      offset: query.offset,
    });

    return {
      items: page.items.map(toAnalysisJobSummary),
      total: page.total,
      limit: query.limit,
      offset: query.offset,
    };
  }
}
