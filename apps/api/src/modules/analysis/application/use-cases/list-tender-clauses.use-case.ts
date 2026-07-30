import { Inject, Injectable } from "@nestjs/common";
import { GetTenderUseCase } from "../../../tenders";
import { BUSINESS_ANALYSIS_REPOSITORY, type BusinessAnalysisRepository, type ClauseFindingRecord } from "../ports/business-analysis.repository";
import { executeListTenderFindings, type FindingsPageResult, type ListTenderFindingsQuery } from "./list-tender-findings.shared";

@Injectable()
export class ListTenderClausesUseCase {
  constructor(
    private readonly getTenderUseCase: GetTenderUseCase,
    @Inject(BUSINESS_ANALYSIS_REPOSITORY) private readonly businessAnalysisRepository: BusinessAnalysisRepository,
  ) {}

  async execute(query: ListTenderFindingsQuery): Promise<FindingsPageResult<ClauseFindingRecord>> {
    return executeListTenderFindings({
      getTenderUseCase: this.getTenderUseCase,
      businessAnalysisRepository: this.businessAnalysisRepository,
      query,
      list: (input) => this.businessAnalysisRepository.listClauses(input),
    });
  }
}
