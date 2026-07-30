import { Inject, Injectable } from "@nestjs/common";
import { GetTenderUseCase } from "../../../tenders";
import { BUSINESS_ANALYSIS_REPOSITORY, type BusinessAnalysisRepository, type RequirementFindingRecord } from "../ports/business-analysis.repository";
import { executeListTenderFindings, type FindingsPageResult, type ListTenderFindingsQuery } from "./list-tender-findings.shared";

@Injectable()
export class ListTenderRequirementsUseCase {
  constructor(
    private readonly getTenderUseCase: GetTenderUseCase,
    @Inject(BUSINESS_ANALYSIS_REPOSITORY) private readonly businessAnalysisRepository: BusinessAnalysisRepository,
  ) {}

  async execute(query: ListTenderFindingsQuery): Promise<FindingsPageResult<RequirementFindingRecord>> {
    return executeListTenderFindings({
      getTenderUseCase: this.getTenderUseCase,
      businessAnalysisRepository: this.businessAnalysisRepository,
      query,
      list: (input) => this.businessAnalysisRepository.listRequirements(input),
    });
  }
}
