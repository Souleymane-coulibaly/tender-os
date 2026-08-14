/**
 * V2 Sprint 22 (billing, étape 22E, correctif audit Codex P1-02/round 3) — dédup des alertes de
 * seuil d'usage (mission "action métier -> vérification du seuil -> notification si franchissement,
 * jamais sur une simple lecture GET") : la contrainte unique réelle
 * `(organizationId, quotaType, threshold, periodKey)` (voir migration
 * `20260814130000_v2_sprint22e_billing_quota_alert_state`) est la SEULE autorité de l'idempotence,
 * jamais un check-then-act applicatif — même motif que `StripeProcessedEventRepository`/
 * `PassPurchaseRepository.consumeForTender` (compare-and-set / contrainte unique). Vit dans
 * `billing` (déplacé depuis `subscription-usage` round 3) : les modules qui CONSOMMENT réellement
 * un quota (chat, documents, memberships) dépendent déjà tous de `billing`, jamais l'inverse —
 * `billing` peut donc posséder ce port sans jamais créer de cycle.
 */
export interface QuotaAlertRepository {
  /** `true` = première fois pour cette combinaison (l'appelant DOIT alerter) ; `false` = déjà
   *  alerté pour cette période (l'appelant ne fait rien, jamais un second envoi). */
  recordIfNew(input: { organizationId: string; quotaType: string; threshold: number; periodKey: string }): Promise<boolean>;
}

export const QUOTA_ALERT_REPOSITORY = Symbol("QUOTA_ALERT_REPOSITORY");
