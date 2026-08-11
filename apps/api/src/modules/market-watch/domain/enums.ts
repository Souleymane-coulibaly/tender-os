/** Mission §51/§52 — statut d'une correspondance SavedSearch/ExternalTender. */
export const SavedSearchMatchStatus = {
  New: "NEW",
  Interested: "INTERESTED",
  Ignored: "IGNORED",
} as const;
export type SavedSearchMatchStatus = (typeof SavedSearchMatchStatus)[keyof typeof SavedSearchMatchStatus];
const SAVED_SEARCH_MATCH_STATUSES: readonly SavedSearchMatchStatus[] = Object.values(SavedSearchMatchStatus);
export function isSavedSearchMatchStatus(value: string): value is SavedSearchMatchStatus {
  return (SAVED_SEARCH_MATCH_STATUSES as readonly string[]).includes(value);
}

/** Mission §66/§136 — jamais un retry indéfini si le provider email est en panne durablement.
 *  `SENDING` (correctif audit P1-001) — état transitoire posé atomiquement par
 *  `SavedSearchMatchRepository.claimPendingEmailBatch` entre le moment où un match est retenu par
 *  le worker et celui où l'envoi aboutit/échoue : sans lui, deux workers (ou deux ticks qui se
 *  chevauchent) pouvaient lire le même match `PENDING` et envoyer deux emails au même utilisateur. */
export const EmailAlertStatus = {
  Pending: "PENDING",
  Sending: "SENDING",
  Sent: "SENT",
  Failed: "FAILED",
} as const;
export type EmailAlertStatus = (typeof EmailAlertStatus)[keyof typeof EmailAlertStatus];
export const EMAIL_ALERT_MAX_ATTEMPTS = 8;
/** Un match resté `SENDING` plus longtemps que ce délai est considéré comme un bail expiré (crash
 *  worker après claim, avant envoi/sauvegarde) et redevient éligible à un nouveau claim — même
 *  motif que `PrismaOutboxEventRepository.claimPendingBatch` (mission §65), sans colonne
 *  supplémentaire : `updatedAt` sert de date de claim. */
export const EMAIL_ALERT_STALE_CLAIM_THRESHOLD_MS = 10 * 60 * 1000;

/** Mission §43 — Immediate + Daily Digest (recommandation mission retenue). */
export const EmailFrequency = {
  Immediate: "IMMEDIATE",
  DailyDigest: "DAILY_DIGEST",
} as const;
export type EmailFrequency = (typeof EmailFrequency)[keyof typeof EmailFrequency];
export const EMAIL_FREQUENCIES: readonly EmailFrequency[] = Object.values(EmailFrequency);
export function isEmailFrequency(value: string): value is EmailFrequency {
  return (EMAIL_FREQUENCIES as readonly string[]).includes(value);
}
