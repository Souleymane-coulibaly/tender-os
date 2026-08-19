import { InvalidCandidateCompanyStatusError } from "./errors";

/**
 * Cycle de vie d'une `CandidateCompany` (mission TenderOS 2.1-A1) — volontairement à 2 états
 * (contrairement à `ClientAccountStatus`, qui en a 3) : aucun besoin métier d'un état INACTIVE
 * intermédiaire n'a été identifié pour l'entreprise candidate en A1.
 */
export const CandidateCompanyStatus = {
  Active: "ACTIVE",
  Archived: "ARCHIVED",
} as const;

export type CandidateCompanyStatus = (typeof CandidateCompanyStatus)[keyof typeof CandidateCompanyStatus];

export function isCandidateCompanyStatus(value: string): value is CandidateCompanyStatus {
  return Object.values(CandidateCompanyStatus).includes(value as CandidateCompanyStatus);
}

export function parseCandidateCompanyStatus(value: string): CandidateCompanyStatus {
  if (!isCandidateCompanyStatus(value)) {
    throw new InvalidCandidateCompanyStatusError(value);
  }
  return value;
}
