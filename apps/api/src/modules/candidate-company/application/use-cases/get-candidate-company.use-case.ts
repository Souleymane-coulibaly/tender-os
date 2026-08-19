import { Inject, Injectable } from "@nestjs/common";
import { CandidateCompanyNotFoundError } from "../../domain/errors";
import { toCandidateCompanySummary, type CandidateCompanySummary } from "../dtos";
import { CANDIDATE_COMPANY_REPOSITORY, type CandidateCompanyRepository } from "../ports/candidate-company.repository";

export type GetCandidateCompanyQuery = Readonly<{ organizationId: string; candidateCompanyId: string }>;

/** Lecture organization-isolation-only : 404 (jamais 403) dès que l'entreprise candidate n'existe
 *  pas dans CETTE organisation — même convention que `ClientAccountNotFoundError`. */
@Injectable()
export class GetCandidateCompanyUseCase {
  constructor(@Inject(CANDIDATE_COMPANY_REPOSITORY) private readonly candidateCompanyRepository: CandidateCompanyRepository) {}

  async execute(query: GetCandidateCompanyQuery): Promise<CandidateCompanySummary> {
    const company = await this.candidateCompanyRepository.findById({
      organizationId: query.organizationId,
      candidateCompanyId: query.candidateCompanyId,
    });
    if (!company) {
      throw new CandidateCompanyNotFoundError();
    }
    return toCandidateCompanySummary(company);
  }
}
