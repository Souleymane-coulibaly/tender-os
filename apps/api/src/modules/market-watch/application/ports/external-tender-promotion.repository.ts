export type ExternalTenderPromotionRecord = Readonly<{ id: string; organizationId: string; externalTenderId: string; clientAccountId?: string | undefined; opportunityId: string; createdBy: string; createdAt: Date }>;

export interface ExternalTenderPromotionRepository {
  create(record: ExternalTenderPromotionRecord): Promise<void>;
  findByExternalTenderAndClient(input: { organizationId: string; externalTenderId: string; clientAccountId?: string | undefined }): Promise<ExternalTenderPromotionRecord | null>;
  /** Correctif audit P1-002 — verrou consultatif transactionnel Postgres (`pg_advisory_xact_lock`,
   *  même motif que `PrismaChecklistItemRepository.lockTenderForDedup`) scopé à (organizationId,
   *  externalTenderId, clientAccountId), à acquérir AVANT `findByExternalTenderAndClient` dans le
   *  même appel à `AtomicTransactionRunner.run()` : sans lui, deux promotions concurrentes du même
   *  marché pour le même client peuvent chacune lire "aucune promotion existante" avant que l'une
   *  n'ait committé, et créer deux Opportunities pour le même marché. Libéré automatiquement au
   *  commit/rollback de la transaction ambiante, jamais un déverrouillage manuel. */
  lockForPromotion(input: { organizationId: string; externalTenderId: string; clientAccountId?: string | undefined }): Promise<void>;
}

export const EXTERNAL_TENDER_PROMOTION_REPOSITORY = Symbol("EXTERNAL_TENDER_PROMOTION_REPOSITORY");
