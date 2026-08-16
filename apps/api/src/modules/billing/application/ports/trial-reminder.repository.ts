/**
 * V2 Sprint 25 (Trial Starter) — mission §93 "chaque rappel doit être idempotent... pas de
 * refresh -> nouveau mail, pas de scheduler retry -> email dupliqué". Port dédié pour le seul
 * mécanisme de dédup nécessaire (`TrialReminderRecord`), jamais mêlé au ledger AO ni à
 * `OrganizationSubscription` (source de vérité différente pour un besoin différent).
 */
export interface TrialReminderRepository {
  /** Insertion atomique — `true` si CET appel est le premier pour ce jalon (l'appelant doit
   *  émettre la notification), `false` s'il a déjà été envoyé (jamais un second envoi). La
   *  contrainte unique réelle `(organization_id, days_remaining)` est la SEULE autorité sous
   *  concurrence, jamais une vérification applicative seule (même discipline que
   *  `QuotaAlertRepository.recordIfNew`, Sprint 22E). */
  recordIfNotSent(input: { organizationId: string; daysRemaining: number; occurredAt: Date }): Promise<boolean>;
}

export const TRIAL_REMINDER_REPOSITORY = Symbol("TRIAL_REMINDER_REPOSITORY");
