export type ChecklistReconciliationState = Readonly<{
  tenderId: string;
  lastReconciledAnalysisVersion: number;
  /** Dénormalisé pour l'observabilité uniquement (mission Checkpoint 2.1-P2.1-FIX-B §26) — jamais
   *  consulté par `computeChecklistFreshness`, qui ne compare que des `analysisVersion`. */
  lastReconciledDceRevision?: number | undefined;
  reconciledByUserId: string;
  reconciledAt: string;
}>;

/**
 * Checkpoint 2.1-P2.1-FIX-B — une seule ligne par Tender (upsert), trace la dernière
 * `analysisVersion` contre laquelle `ReconcileChecklistWithNewAnalysisUseCase` a réellement tourné.
 * Port séparé de `ChecklistItemRepository` (concept distinct : état tender-level de la
 * réconciliation, jamais un ChecklistItem individuel).
 */
export interface ChecklistReconciliationRepository {
  find(input: { organizationId: string; tenderId: string }): Promise<ChecklistReconciliationState | null>;
  upsert(input: {
    /** Utilisé uniquement si la ligne n'existe pas encore (branche CREATE) — même discipline que
     *  tout le reste du dépôt : l'ID est toujours généré par l'appelant (`ID_GENERATOR`), jamais par
     *  le repository lui-même. */
    id: string;
    organizationId: string;
    tenderId: string;
    analysisVersion: number;
    dceRevision: number | undefined;
    reconciledByUserId: string;
    occurredAt: Date;
  }): Promise<void>;
}

export const CHECKLIST_RECONCILIATION_REPOSITORY = Symbol("CHECKLIST_RECONCILIATION_REPOSITORY");
