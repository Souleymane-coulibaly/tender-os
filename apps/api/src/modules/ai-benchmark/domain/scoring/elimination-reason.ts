/** Un modèle éliminé ne peut jamais gagner un classement sur le seul critère coût (Sprint 5.2
 *  §"Un modèle éliminé ne doit pas gagner sur le seul critère coût") — voir `hard-elimination-rules`. */
export const EliminationReason = {
  TenantLeakage: "TENANT_LEAKAGE",
  InvalidProvenance: "INVALID_PROVENANCE",
  CriticalHallucination: "CRITICAL_HALLUCINATION",
  InvalidJsonRateTooHigh: "INVALID_JSON_RATE_TOO_HIGH",
  FailureRateTooHigh: "FAILURE_RATE_TOO_HIGH",
  QualityBelowThreshold: "QUALITY_BELOW_THRESHOLD",
} as const;

export type EliminationReason = (typeof EliminationReason)[keyof typeof EliminationReason];
