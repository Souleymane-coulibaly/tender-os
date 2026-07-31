/**
 * Conditions d'escalade DÉTERMINISTES (Sprint 5.2 §"Conditions d'escalade") — jamais le score
 * auto-déclaré du modèle comme seule condition (mission §"Ne pas utiliser le score déclaré par le
 * modèle comme seule condition d'escalade"). Combinées à des validations déterministes/règles
 * métier/statut fournisseur, jamais une simple lecture de confiance auto-rapportée.
 *
 * Vit dans `analysis` (et non `ai-benchmark`) car c'est CE module qui déclenche réellement
 * l'escalade lors d'une analyse live (`ProcessAnalysisJobUseCase`) — `ai-benchmark` la réutilise
 * telle quelle pour définir ses `RoutingPolicy.escalationConditions`, exactement comme il réutilise
 * déjà `PromptKey`/`AIProviderRegistry` : jamais de dépendance dans l'autre sens.
 */
export const EscalationCondition = {
  InvalidJson: "INVALID_JSON",
  UnknownSource: "UNKNOWN_SOURCE",
  CitationNotFound: "CITATION_NOT_FOUND",
  LowConfidence: "LOW_CONFIDENCE",
  IncompleteResult: "INCOMPLETE_RESULT",
  ProviderError: "PROVIDER_ERROR",
  Timeout: "TIMEOUT",
} as const;

export type EscalationCondition = (typeof EscalationCondition)[keyof typeof EscalationCondition];

export function isEscalationCondition(value: string): value is EscalationCondition {
  return Object.values(EscalationCondition).includes(value as EscalationCondition);
}
