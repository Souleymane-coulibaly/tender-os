/**
 * Sprint 21 (hardening) — mission PARTIE F : bail court (organizationId, source) réclamé par
 * `MarketSourceSyncWorker` avant de synchroniser une source pour une organisation — même motif que
 * le claim/lock des autres workers (Outbox/Webhook/Email), adapté à l'absence de file de lignes
 * individuelles ici (il n'y a rien à "réclamer" à part le DROIT de synchroniser CE couple
 * maintenant). Jamais de libération explicite : le bail expire naturellement après
 * `leaseDurationMs` (même motif que `OutboxEvent.availableAt`).
 */
export interface MarketSourceSyncLeaseRepository {
  /** Tente d'acquérir le bail — `true` si acquis (aucune autre instance ne le détient
   *  actuellement), `false` sinon (une autre instance synchronise déjà ce couple). Atomique (une
   *  seule instruction SQL), jamais un lire-puis-écrire non protégé. */
  tryClaim(input: { organizationId: string; source: string; now: Date; leaseDurationMs: number }): Promise<boolean>;
}

export const MARKET_SOURCE_SYNC_LEASE_REPOSITORY = Symbol("MARKET_SOURCE_SYNC_LEASE_REPOSITORY");
