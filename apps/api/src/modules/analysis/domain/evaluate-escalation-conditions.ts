import { EscalationCondition } from "./escalation-condition";

export type EscalationSignals = Readonly<{
  jsonValid: boolean;
  provenanceStatus: "VALID" | "UNKNOWN_SOURCE" | "CITATION_NOT_FOUND" | "NOT_APPLICABLE";
  confidence?: number | undefined;
  complete: boolean;
  providerErrorOccurred: boolean;
  timedOut: boolean;
}>;

/**
 * Évalue si le résultat PRIMAIRE d'une analyse déclenche l'escalade (Sprint 5.2 §"Routage à
 * l'exécution" + §"Fallback") — fonction PURE, aucune I/O, utilisée par `ProcessAnalysisJobUseCase`
 * (escalade live) et réutilisée par `ai-benchmark` (Phase 3, mêmes conditions). Ne vérifie QUE les
 * conditions effectivement configurées sur la policy (`policyConditions`) — une condition absente
 * de la policy n'est jamais évaluée, même si son signal est défavorable. Retourne la PREMIÈRE
 * condition déclenchée dans un ordre déterministe (jamais un score auto-déclaré comme seul juge).
 */
export function evaluateEscalationConditions(
  signals: EscalationSignals,
  policyConditions: readonly EscalationCondition[],
  confidenceThreshold?: number,
): EscalationCondition | null {
  const enabled = new Set(policyConditions);

  if (enabled.has(EscalationCondition.ProviderError) && signals.providerErrorOccurred) {
    return EscalationCondition.ProviderError;
  }
  if (enabled.has(EscalationCondition.Timeout) && signals.timedOut) {
    return EscalationCondition.Timeout;
  }
  if (enabled.has(EscalationCondition.InvalidJson) && !signals.jsonValid) {
    return EscalationCondition.InvalidJson;
  }
  if (enabled.has(EscalationCondition.UnknownSource) && signals.provenanceStatus === "UNKNOWN_SOURCE") {
    return EscalationCondition.UnknownSource;
  }
  if (enabled.has(EscalationCondition.CitationNotFound) && signals.provenanceStatus === "CITATION_NOT_FOUND") {
    return EscalationCondition.CitationNotFound;
  }
  if (
    enabled.has(EscalationCondition.LowConfidence) &&
    signals.confidence !== undefined &&
    confidenceThreshold !== undefined &&
    signals.confidence < confidenceThreshold
  ) {
    return EscalationCondition.LowConfidence;
  }
  if (enabled.has(EscalationCondition.IncompleteResult) && !signals.complete) {
    return EscalationCondition.IncompleteResult;
  }

  return null;
}
