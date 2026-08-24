/**
 * Sprint 21 (hardening) — mission PARTIE F : bail court (organizationId, source) réclamé par
 * `MarketSourceSyncWorker` avant de synchroniser une source pour une organisation — même motif que
 * le claim/lock des autres workers (Outbox/Webhook/Email), adapté à l'absence de file de lignes
 * individuelles ici (il n'y a rien à "réclamer" à part le DROIT de synchroniser CE couple
 * maintenant).
 *
 * Diagnostic runtime E10 (correctif) — la décision d'origine "jamais de libération explicite, le
 * bail expire naturellement" était correcte tant que le SEUL appelant était le worker horaire (TTL
 * 10 min << intervalle 1h). Preuve PostgreSQL réelle du problème depuis "Tester la veille" (E10) :
 * un sync réel s'achève en ~11 s mais son bail restait détenu 10 minutes PLEINES — tout second
 * déclenchement (clic "Tester la veille", tick chevauchant) recevait "lease already held by another
 * instance" pendant ~9 min 49 s alors qu'AUCUN travail n'était en cours. `release()` (appelé en
 * `finally` par `SyncOrganizationMarketSourcesUseCase`, succès COMME échec) ramène la détention à
 * la durée réelle du sync ; `leaseDurationMs` ne reste que la borne de récupération après crash
 * (process tué avant le `finally`) — jamais la durée nominale de détention.
 */
export interface MarketSourceSyncLeaseRepository {
  /** Tente d'acquérir le bail — `true` si acquis (aucune autre instance ne le détient
   *  actuellement), `false` sinon (une autre instance synchronise déjà ce couple). Atomique (une
   *  seule instruction SQL), jamais un lire-puis-écrire non protégé. */
  tryClaim(input: { organizationId: string; source: string; now: Date; leaseDurationMs: number }): Promise<boolean>;
  /** Libère le bail détenu (le fait expirer immédiatement) — appelé par le détenteur à la fin de SON
   *  sync (succès comme échec). Ne touche jamais un bail déjà expiré (jamais une prolongation
   *  accidentelle), et reste sans effet si aucun bail n'existe. Aucun ownerId n'est suivi : le seul
   *  appelant est le code qui vient de terminer le sync couvert par ce bail, et le pire cas d'une
   *  libération erronée est un sync supplémentaire — sûr, l'idempotence réelle vit plus bas
   *  (`ExternalTender` dédup + contrainte unique `SavedSearchMatch`). */
  release(input: { organizationId: string; source: string; now: Date }): Promise<void>;
}

export const MARKET_SOURCE_SYNC_LEASE_REPOSITORY = Symbol("MARKET_SOURCE_SYNC_LEASE_REPOSITORY");
