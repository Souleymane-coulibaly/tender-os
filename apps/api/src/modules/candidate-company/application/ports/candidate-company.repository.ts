import type { CandidateCompany } from "../../domain/candidate-company.aggregate";
import type { CandidateEstablishment } from "../../domain/candidate-establishment.entity";

export type ListCandidateCompaniesFilter = Readonly<{
  organizationId: string;
  includeArchived: boolean;
  cursor?: string | undefined;
  limit: number;
}>;

export type ListCandidateCompaniesResult = Readonly<{ items: readonly CandidateCompany[]; nextCursor: string | null; total: number }>;

/**
 * Repository minimal (mission §"minimal repository") — un seul port couvrant `CandidateCompany` et
 * ses `CandidateEstablishment` (pas deux repositories distincts comme `client-portfolio`, dont la
 * surface bien plus large — assignations, policies — n'a pas d'équivalent en A1).
 */
export interface CandidateCompanyRepository {
  findById(input: { organizationId: string; candidateCompanyId: string }): Promise<CandidateCompany | null>;
  findByNormalizedName(input: { organizationId: string; nameNormalized: string }): Promise<CandidateCompany | null>;
  /** Mission 2.1-A2 §11 — clé d'idempotence du backfill, jamais une relation métier permanente.
   *  Repose sur `@@unique([organizationId, sourceClientAccountId])` (migration A1) : un
   *  `ClientAccount` ne peut produire qu'au plus une `CandidateCompany` par organisation. */
  findBySourceClientAccountId(input: { organizationId: string; sourceClientAccountId: string }): Promise<CandidateCompany | null>;
  create(company: CandidateCompany): Promise<void>;
  save(company: CandidateCompany): Promise<void>;
  list(filter: ListCandidateCompaniesFilter): Promise<ListCandidateCompaniesResult>;

  findEstablishmentBySiret(input: { organizationId: string; siret: string }): Promise<CandidateEstablishment | null>;
  createEstablishment(establishment: CandidateEstablishment): Promise<void>;
  listEstablishmentsByCompany(input: { organizationId: string; candidateCompanyId: string }): Promise<readonly CandidateEstablishment[]>;
}

export const CANDIDATE_COMPANY_REPOSITORY = Symbol("CANDIDATE_COMPANY_REPOSITORY");
