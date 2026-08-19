import { Inject, Injectable } from "@nestjs/common";
import { CandidateCompanyNotFoundError } from "../../domain/errors";
import { toCandidateEstablishmentSummary, type CandidateEstablishmentSummary } from "../dtos";
import { CANDIDATE_COMPANY_REPOSITORY, type CandidateCompanyRepository } from "../ports/candidate-company.repository";

export type ListCandidateEstablishmentsQuery = Readonly<{ organizationId: string; candidateCompanyId: string }>;

/**
 * Checkpoint 2.1-A6.4 (DEFERRED-BE-04) — listing canonique des établissements d'une entreprise
 * candidate, jusqu'ici absent (seule l'écriture — `AddCandidateEstablishmentUseCase` — existait ;
 * la lecture agrégée, elle, n'était consommée qu'en interne par `ResolveCandidateIdentityUseCase`,
 * jamais exposée). Lecture organization-isolation-only : 404 (jamais 403) dès que la CandidateCompany
 * n'existe pas dans CETTE organisation — même convention que `GetCandidateCompanyUseCase` — avant même
 * d'interroger ses établissements, pour ne jamais distinguer "candidat inexistant" de "candidat vide"
 * via un timing ou un comportement différent.
 */
@Injectable()
export class ListCandidateEstablishmentsUseCase {
  constructor(@Inject(CANDIDATE_COMPANY_REPOSITORY) private readonly candidateCompanyRepository: CandidateCompanyRepository) {}

  async execute(query: ListCandidateEstablishmentsQuery): Promise<readonly CandidateEstablishmentSummary[]> {
    const company = await this.candidateCompanyRepository.findById({
      organizationId: query.organizationId,
      candidateCompanyId: query.candidateCompanyId,
    });
    if (!company) {
      throw new CandidateCompanyNotFoundError();
    }

    const establishments = await this.candidateCompanyRepository.listEstablishmentsByCompany({
      organizationId: query.organizationId,
      candidateCompanyId: query.candidateCompanyId,
    });
    return establishments.map(toCandidateEstablishmentSummary);
  }
}
