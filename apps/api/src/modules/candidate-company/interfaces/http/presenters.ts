import type { CandidateCompanySummary, CandidateEstablishmentSummary } from "../../application/dtos";

// Passe-plat volontaire (même motif que Client Portfolio) — les DTO n'exposent déjà jamais de
// détail interne.
export function presentCandidateCompany(company: CandidateCompanySummary): CandidateCompanySummary {
  return { ...company };
}

export function presentCandidateEstablishment(establishment: CandidateEstablishmentSummary): CandidateEstablishmentSummary {
  return { ...establishment };
}

export function presentPage<T>(items: T[], nextCursor: string | null): { items: T[]; nextCursor: string | null } {
  return { items, nextCursor };
}
