import { Inject, Injectable } from "@nestjs/common";
import { GetTenderUseCase } from "../../../tenders";
import { BUSINESS_ANALYSIS_REPOSITORY, type BusinessAnalysisRepository, type DeadlineFindingRecord } from "../ports/business-analysis.repository";
import { executeListTenderFindings, type FindingsPageResult, type ListTenderFindingsQuery } from "./list-tender-findings.shared";

@Injectable()
export class ListTenderDeadlinesUseCase {
  constructor(
    private readonly getTenderUseCase: GetTenderUseCase,
    @Inject(BUSINESS_ANALYSIS_REPOSITORY) private readonly businessAnalysisRepository: BusinessAnalysisRepository,
  ) {}

  async execute(query: ListTenderFindingsQuery): Promise<FindingsPageResult<DeadlineFindingRecord>> {
    return executeListTenderFindings({
      getTenderUseCase: this.getTenderUseCase,
      businessAnalysisRepository: this.businessAnalysisRepository,
      query,
      list: (input) => this.businessAnalysisRepository.listDeadlines(input),
    });
  }
}
