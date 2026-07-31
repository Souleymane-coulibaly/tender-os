import { EliminationReason } from "./elimination-reason";

/** Seuils éliminatoires (Sprint 5.2 §"Prévoir des seuils éliminatoires") — nommés et documentés
 *  plutôt que des nombres magiques, pour rester ajustables sans changer la logique. */
export const INVALID_JSON_RATE_ELIMINATION_THRESHOLD = 0.5;
export const FAILURE_RATE_ELIMINATION_THRESHOLD = 0.5;
export const MINIMUM_QUALITY_SCORE_THRESHOLD = 0.4;

export type HardEliminationInput = Readonly<{
  tenantLeakageDetected: boolean;
  invalidProvenanceDetected: boolean;
  criticalHallucinationDetected: boolean;
  invalidJsonRate: number;
  failureRate: number;
  averageQualityScore: number;
}>;

/**
 * Un modèle qui déclenche l'une de ces conditions est éliminé du classement quel que soit son
 * score par ailleurs — l'ordre de vérification importe pour le message renvoyé (fuite tenant/client
 * = le motif le plus grave, toujours prioritaire), mais chaque condition est indépendante des
 * autres. Retourne `null` si le modèle est admissible (mission §"un modèle éliminé ne doit pas
 * gagner sur le seul critère coût" — jamais contourné par un score élevé sur une autre dimension).
 */
export function applyHardEliminationRules(input: HardEliminationInput): EliminationReason | null {
  if (input.tenantLeakageDetected) return EliminationReason.TenantLeakage;
  if (input.invalidProvenanceDetected) return EliminationReason.InvalidProvenance;
  if (input.criticalHallucinationDetected) return EliminationReason.CriticalHallucination;
  if (input.invalidJsonRate > INVALID_JSON_RATE_ELIMINATION_THRESHOLD) return EliminationReason.InvalidJsonRateTooHigh;
  if (input.failureRate > FAILURE_RATE_ELIMINATION_THRESHOLD) return EliminationReason.FailureRateTooHigh;
  if (input.averageQualityScore < MINIMUM_QUALITY_SCORE_THRESHOLD) return EliminationReason.QualityBelowThreshold;
  return null;
}
