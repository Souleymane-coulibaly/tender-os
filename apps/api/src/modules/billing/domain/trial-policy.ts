/**
 * V2 Sprint 25 (activation, Trial Starter) — mission §6 "source de vérité Trial" : SEULE
 * constante centrale de durée d'essai, jamais un `14` répété en dur (Landing, Pricing, backend,
 * emails, Dashboard, Onboarding doivent tous dériver de CETTE valeur). Réservé à STARTER
 * (mission §2) — Pass/Business/Enterprise/Conseil n'ont jamais de Trial.
 */
export const STARTER_TRIAL_DAYS = 14;

/** Jalons de rappel (mission §29 : J7 -> 7 jours restants, J11 -> 3 jours restants, J13 -> demain)
 *  exprimés en jours restants avant `trialEndsAt`, dérivés de `STARTER_TRIAL_DAYS` plutôt que des
 *  constantes indépendantes (14 - 7 = 7, 14 - 11 = 3, 14 - 13 = 1). */
export const TRIAL_REMINDER_DAYS_REMAINING: readonly number[] = [
  STARTER_TRIAL_DAYS - 7,
  STARTER_TRIAL_DAYS - 11,
  STARTER_TRIAL_DAYS - 13,
];

/** Nombre de jours restants avant `trialEndsAt`, arrondi au jour supérieur (mission §28 "11 jours
 *  restants") — jamais un calcul dupliqué dans chaque composant/notification appelant. */
export function daysRemainingInTrial(trialEndsAt: Date, now: Date): number {
  const millisecondsRemaining = trialEndsAt.getTime() - now.getTime();
  return Math.max(0, Math.ceil(millisecondsRemaining / (24 * 60 * 60 * 1000)));
}
