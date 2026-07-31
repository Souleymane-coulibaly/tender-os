import { clampScore, type QualityDimensionScores } from "./dimension-score";

/**
 * Pondération par défaut (Sprint 5.2 §"Score global", exemple de pondération initiale repris tel
 * quel) — la sécurité/fiabilité (exactitude + absence d'hallucination + provenance = 75%) pèse
 * largement plus que le coût/latence (5%), jamais l'inverse (mission §"Le poids de la sécurité et
 * de la fiabilité doit rester supérieur au coût"). Les 5 dimensions qualité totalisent 0.95 ; les
 * 0.05 restants viennent de `costLatencyEfficiency`, calculé au niveau de l'agrégation d'un run
 * (relatif aux autres modèles comparés dans CE run — voir `aggregate-benchmark-run-results`),
 * jamais ici : cette fonction reste pure et ne connaît aucun autre modèle.
 */
export const QUALITY_DIMENSION_WEIGHTS = {
  businessAccuracy: 0.3,
  hallucinationAbsence: 0.25,
  provenanceValidity: 0.2,
  completeness: 0.1,
  structuralConformity: 0.1,
} as const;

export const COST_LATENCY_WEIGHT = 0.05;

export function calculateGlobalScore(dimensions: QualityDimensionScores, costLatencyEfficiency: number): number {
  const qualityScore =
    dimensions.businessAccuracy * QUALITY_DIMENSION_WEIGHTS.businessAccuracy +
    dimensions.hallucinationAbsence * QUALITY_DIMENSION_WEIGHTS.hallucinationAbsence +
    dimensions.provenanceValidity * QUALITY_DIMENSION_WEIGHTS.provenanceValidity +
    dimensions.completeness * QUALITY_DIMENSION_WEIGHTS.completeness +
    dimensions.structuralConformity * QUALITY_DIMENSION_WEIGHTS.structuralConformity;

  return clampScore(qualityScore + clampScore(costLatencyEfficiency) * COST_LATENCY_WEIGHT);
}

/** Efficacité coût/latence RELATIVE aux autres modèles comparés dans le même run (Sprint 5.2 —
 *  jamais un modèle moins cher ne doit gagner sur ce seul critère si sa qualité est insuffisante,
 *  d'où le poids volontairement faible de 5% et son calcul relatif plutôt qu'absolu : un modèle
 *  moyen dans un run de modèles chers n'est pas artificiellement pénalisé). Le moins cher/rapide du
 *  run obtient 1, le plus cher/lent obtient 0, une interpolation linéaire entre les deux. */
export function calculateRelativeCostLatencyEfficiency(input: {
  cost: number;
  latencyMs: number;
  minCost: number;
  maxCost: number;
  minLatencyMs: number;
  maxLatencyMs: number;
}): number {
  const costScore = input.maxCost === input.minCost ? 1 : 1 - (input.cost - input.minCost) / (input.maxCost - input.minCost);
  const latencyScore =
    input.maxLatencyMs === input.minLatencyMs ? 1 : 1 - (input.latencyMs - input.minLatencyMs) / (input.maxLatencyMs - input.minLatencyMs);
  return clampScore((costScore + latencyScore) / 2);
}
