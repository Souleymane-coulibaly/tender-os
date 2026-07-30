/**
 * Origine d'une tentative d'analyse (mission Sprint 4.1) — journalisée sur `AnalysisAttempt` pour
 * distinguer un premier déclenchement d'un retry explicite, jamais pour porter une logique
 * métier : `SYSTEM` reste réservé à un futur déclenchement automatique (hors périmètre 4.1, jamais
 * utilisé par le code applicatif de cette tranche).
 */
export const AnalysisTrigger = {
  Manual: "MANUAL",
  Retry: "RETRY",
  System: "SYSTEM",
} as const;

export type AnalysisTrigger = (typeof AnalysisTrigger)[keyof typeof AnalysisTrigger];
