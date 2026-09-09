import type { CandidateCapabilityRecord } from "../../application/use-cases/candidate-capability.use-cases";

/**
 * Checkpoint TENDEROS-2.1-CCV2-C — présentation d'une capacité candidate.
 *
 * `clientAccountId` est DÉLIBÉRÉMENT retiré de la réponse : c'est un pointeur de LIGNAGE interne
 * (CCV2-B), pas une donnée métier de l'entreprise candidate. L'exposer inviterait un client d'API à
 * s'en servir comme identité, exactement le couplage que CCV2 supprime.
 *
 * Aucune donnée bancaire ne peut transiter ici : le contrôleur candidate n'expose aucune route
 * `bank-accounts` (banking = CCV2-C.1), et ce présentateur ne connaît ni `iban` ni `bic`.
 */
export function presentCandidateCapability(record: CandidateCapabilityRecord): Record<string, unknown> {
  const { clientAccountId: _lineage, ...rest } = record as Record<string, unknown> & { clientAccountId: string | null };
  return rest;
}
