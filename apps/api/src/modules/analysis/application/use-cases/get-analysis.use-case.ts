import { Inject, Injectable } from "@nestjs/common";
import { AnalysisPermission } from "../../domain/analysis-permission";
import { AnalysisNotFoundError } from "../../domain/errors";
import { assertHasAnalysisPermission } from "../policies/analysis-authorization.policy";
import { ANALYSIS_JOB_REPOSITORY, type AnalysisJobRepository } from "../ports/analysis-job.repository";
import { toAnalysisJobSummary, type AnalysisJobSummary } from "../dtos";

export type GetAnalysisQuery = Readonly<{
  organizationId: string;
  jobId: string;
  actorRole: string;
}>;

@Injectable()
export class GetAnalysisUseCase {
  constructor(@Inject(ANALYSIS_JOB_REPOSITORY) private readonly jobRepository: AnalysisJobRepository) {}

  async execute(query: GetAnalysisQuery): Promise<AnalysisJobSummary> {
    assertHasAnalysisPermission(query.actorRole, AnalysisPermission.Read);

    const job = await this.jobRepository.findById({ organizationId: query.organizationId, jobId: query.jobId });
    if (!job) {
      throw new AnalysisNotFoundError();
    }

    return toAnalysisJobSummary(job);
  }
}
