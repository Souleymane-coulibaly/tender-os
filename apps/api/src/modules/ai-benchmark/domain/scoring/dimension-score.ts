/** Chaque dimension est bornée [0, 1] (Sprint 5.2 §"Métriques obligatoires") — jamais négative,
 *  jamais > 1, pour rester combinable par une simple somme pondérée (`benchmark-score-calculator`). */
export type QualityDimensionScores = Readonly<{
  businessAccuracy: number;
  hallucinationAbsence: number;
  provenanceValidity: number;
  completeness: number;
  structuralConformity: number;
}>;

export function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
