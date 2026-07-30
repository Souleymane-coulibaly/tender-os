/** Cycle de vie du TRAITEMENT d'un document lié à une entrée (mission Sprint 5 §2/§6/§7) — distinct
 *  du statut de l'entrée elle-même (`KnowledgeEntryStatus`) : plusieurs documents peuvent en
 *  principe être liés à une même entrée au fil du temps (remplacements successifs), chacun gardant
 *  son propre historique de traitement, jamais fusionné. */
export const KnowledgeDocumentStatus = {
  Pending: "PENDING",
  Processing: "PROCESSING",
  Ready: "READY",
  PartiallyReady: "PARTIALLY_READY",
  Failed: "FAILED",
} as const;

export type KnowledgeDocumentStatus = (typeof KnowledgeDocumentStatus)[keyof typeof KnowledgeDocumentStatus];

const NON_TERMINAL: readonly KnowledgeDocumentStatus[] = [KnowledgeDocumentStatus.Pending, KnowledgeDocumentStatus.Processing];

export function isKnowledgeDocumentReprocessable(status: KnowledgeDocumentStatus): boolean {
  return !NON_TERMINAL.includes(status);
}
