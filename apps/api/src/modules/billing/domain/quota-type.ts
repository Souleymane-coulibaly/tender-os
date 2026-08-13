/**
 * V2 Sprint 22 (billing, étape 22A) — limites déclarées par palier (plan-catalog.ts). Les valeurs
 * COURANTES consommées (crédits AO restants, utilisateurs actifs, appels Chat IA du jour, Go
 * réellement utilisé) appartiennent au ledger/compteurs d'usage (22B), jamais à ce module : ici on
 * ne répond qu'à "quelle est la LIMITE", jamais "combien reste-t-il".
 */
export const QuotaType = {
  /** Crédits AO accordés par mois glissant (0 pour PASS — hors modèle de grant récurrent, voir OrganizationPassPurchase). */
  AoMonthlyGrant: "AO_MONTHLY_GRANT",
  /** Plafond de cumul (rollover) des crédits AO non consommés. */
  AoRolloverCap: "AO_ROLLOVER_CAP",
  /** Nombre maximum d'utilisateurs actifs dans l'organisation. */
  UsersMax: "USERS_MAX",
  /** Nombre maximum de requêtes Chat IA par jour et par organisation. */
  ChatAiDailyMax: "CHAT_AI_DAILY_MAX",
  /** Stockage documentaire maximum, en Go. */
  StorageGbMax: "STORAGE_GB_MAX",
} as const;

export type QuotaType = (typeof QuotaType)[keyof typeof QuotaType];

/** Sentinelle explicite (mission "illimités* fair-use") — jamais un grand nombre magique en dur. */
export const UNLIMITED = "UNLIMITED" as const;
export type QuotaLimit = number | typeof UNLIMITED;

export function isQuotaType(value: string): value is QuotaType {
  return Object.values(QuotaType).includes(value as QuotaType);
}
