import { Inject, Injectable } from "@nestjs/common";
import { toCandidateCompanySummary, type CandidateCompanySummary } from "../dtos";
import { CANDIDATE_COMPANY_REPOSITORY, type CandidateCompanyRepository } from "../ports/candidate-company.repository";

export type ListCandidateCompaniesQuery = Readonly<{
  organizationId: string;
  includeArchived?: boolean | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}>;

export type ListCandidateCompaniesResult = Readonly<{ items: readonly CandidateCompanySummary[]; nextCursor: string | null; total: number }>;

@Injectable()
export class ListCandidateCompaniesUseCase {
  constructor(@Inject(CANDIDATE_COMPANY_REPOSITORY) private readonly candidateCompanyRepository: CandidateCompanyRepository) {}

  async execute(query: ListCandidateCompaniesQuery): Promise<ListCandidateCompaniesResult> {
    const result = await this.candidateCompanyRepository.list({
      organizationId: query.organizationId,
      includeArchived: query.includeArchived ?? false,
      cursor: query.cursor,
      limit: query.limit ?? 25,
    });
    return { items: result.items.map(toCandidateCompanySummary), nextCursor: result.nextCursor, total: result.total };
  }
}
