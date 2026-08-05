export interface ProcessedEventRepository {
  /** Idempotent : appeler deux fois pour le même (outboxEventId, consumerName) ne produit
   *  qu'une seule ligne et ne lève jamais — DATABASE_PATTERNS.md §41 / mission Sprint 1 §2
   *  "aucun double traitement produisant un effet métier dupliqué". */
  recordProcessed(input: {
    organizationId: string;
    outboxEventId: string;
    consumerName: string;
    result?: string | undefined;
  }): Promise<void>;

  wasProcessedBy(input: { outboxEventId: string; consumerName: string }): Promise<boolean>;
}

export const PROCESSED_EVENT_REPOSITORY = Symbol("PROCESSED_EVENT_REPOSITORY");
