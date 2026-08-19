import { DomainError } from "../../../shared-kernel/domain-error";

export class CandidateCompanyNotFoundError extends DomainError {
  readonly code = "CANDIDATE_COMPANY_NOT_FOUND";
  constructor() {
    super("Candidate company not found or not accessible.");
  }
}

export class DuplicateCandidateCompanyNameError extends DomainError {
  readonly code = "DUPLICATE_CANDIDATE_COMPANY_NAME";
  constructor() {
    super("A candidate company with this name already exists in this organization.");
  }
}

export class InvalidCandidateCompanyStatusError extends DomainError {
  readonly code = "INVALID_CANDIDATE_COMPANY_STATUS";
  constructor(value: string) {
    super(`Invalid candidate company status: "${value}".`);
  }
}

export class CandidateCompanyArchivedError extends DomainError {
  readonly code = "CANDIDATE_COMPANY_ARCHIVED";
  constructor() {
    super("This candidate company is archived and cannot be mutated.");
  }
}

/** Réutilise la validation Luhn existante (company-profile/domain/french-company-identifiers.ts) —
 *  jamais réimplémentée ici. */
export class InvalidSirenError extends DomainError {
  readonly code = "INVALID_SIREN";
  constructor() {
    super("Invalid SIREN: failed format or checksum validation.");
  }
}

export class InvalidSiretError extends DomainError {
  readonly code = "INVALID_SIRET";
  constructor() {
    super("Invalid SIRET: failed format or checksum validation.");
  }
}

/** Unicité au niveau organisation, pas seulement au niveau entreprise candidate (mission §8) — un
 *  SIRET est un identifiant INSEE réel, jamais partageable entre deux entreprises candidates
 *  distinctes d'une même organisation. */
export class DuplicateCandidateEstablishmentSiretError extends DomainError {
  readonly code = "DUPLICATE_CANDIDATE_ESTABLISHMENT_SIRET";
  constructor() {
    super("A candidate establishment with this SIRET already exists in this organization.");
  }
}

export class CandidateEstablishmentNotFoundError extends DomainError {
  readonly code = "CANDIDATE_ESTABLISHMENT_NOT_FOUND";
  constructor() {
    super("Candidate establishment not found or not accessible.");
  }
}

/** Au plus un établissement principal par entreprise candidate (mission §8) — backstop applicatif
 *  devant l'index unique partiel `candidate_establishments_one_principal_per_company` (migration). */
export class DuplicatePrincipalCandidateEstablishmentError extends DomainError {
  readonly code = "DUPLICATE_PRINCIPAL_CANDIDATE_ESTABLISHMENT";
  constructor() {
    super("This candidate company already has a principal establishment.");
  }
}
