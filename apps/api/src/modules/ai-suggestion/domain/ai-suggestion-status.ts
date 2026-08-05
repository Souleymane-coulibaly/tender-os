/** Mission Sprint 1 §3 — 4 statuts minimaux, VarChar + CHECK (migration). */
export const AiSuggestionStatus = {
  Pending: "PENDING",
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
