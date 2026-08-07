/** Mission Sprint 1 §3 — statuts minimaux, VarChar + CHECK (migration). `Applying` (V2 Sprint 4,
 *  audit Codex P1-001) réserve une suggestion PENDANT que le bridge écrit la donnée métier cible —
 *  jamais un statut terminal : redevient PENDING si l'écriture échoue (voir ApplyAiSuggestionUseCase),
 *  sinon transite vers ACCEPTED/MODIFIED. Empêche structurellement un double-clic/retry de dupliquer
 *  l'effet métier (une seconde tentative ne trouve plus PENDING). */
export const AiSuggestionStatus = {
  Pending: "PENDING",
  Applying: "APPLYING",
  Accepted: "ACCEPTED",
  Modified: "MODIFIED",
  Rejected: "REJECTED",
} as const;

export type AiSuggestionStatus = (typeof AiSuggestionStatus)[keyof typeof AiSuggestionStatus];

/** Une suggestion PENDING peut transiter vers n'importe lequel des 3 statuts terminaux — jamais
 *  l'inverse ("empêcher toute modification silencieuse d'une suggestion déjà traitée"). */
export function isAiSuggestionPending(status: string): boolean {
  return status === AiSuggestionStatus.Pending;
}
