/**
 * Qualité d'une donnée de coût technique lue depuis une `Generation` (mission Sprint 7 §"Gestion
 * d'un coût inconnu" — "ne pas afficher 0€ par défaut... ne pas faire croire qu'un coût nul est
 * confirmé"). Distinct de `PricingStatus` (qui qualifie une `PricingEstimateVersion` entière, pas
 * une donnée technique unitaire).
 */
export const CostDataStatus = {
  /** Montant et tokens tous deux disponibles — le coût reflète fidèlement la génération. */
  Calculated: "CALCULATED",
  /** Des tokens sont connus mais le montant est absent (ex. pricing snapshot introuvable au moment
   *  du calcul), ou l'inverse — jamais traité comme un coût nul. */
  Partial: "PARTIAL",
  /** Aucune donnée exploitable (génération non terminée, échouée sans tokens, ou coût jamais
   *  calculé) — jamais représenté par `0`. */
  Unknown: "UNKNOWN",
} as const;

export type CostDataStatus = (typeof CostDataStatus)[keyof typeof CostDataStatus];
