/**
 * Pondérations du score GO/NO-GO IA — table de référence officielle du Sprint 5, confirmée avec
 * l'utilisateur suite à l'audit Codex (round 1, P1) : "pondérée par risque métier", la conformité
 * (risque d'élimination administrative pure) pèse le plus lourd, suivie de l'administratif/
 * certifications/technique à égalité. SEULE source de vérité — jamais dupliquée ni recalculée
 * ailleurs ; chaque catégorie garde son poids ET sa justification jusqu'à l'affichage final
 * (`OpportunityQuickScore.categoryScores`/`GoNoGoReport.categoryScores`).
 *
 * Niveau 1 (8 catégories, somme 100) — avant DCE, données forcément partielles.
 */
export const LEVEL_1_CATEGORY_WEIGHTS = {
  conformiteGenerale: 20,
  administratif: 15,
  certifications: 15,
  technique: 15,
  references: 10,
  financier: 10,
  ressources: 8,
  planning: 7,
} as const;

export type Level1Category = keyof typeof LEVEL_1_CATEGORY_WEIGHTS;

/**
 * Niveau 2 (7 catégories, somme 100) — pas de "conformité générale" distincte à ce niveau,
 * remplacée par les exigences réelles issues des Findings DCE (déjà comptées dans administratif/
 * technique). Dérivé de la table Niveau 1 ci-dessus : le poids "conformité" (20) est reporté à
 * parts égales sur administratif et technique (+10 chacun), qui portent désormais ce risque via
 * les constats DCE réels — certifications/références/financier/ressources/planning inchangés.
 */
export const LEVEL_2_CATEGORY_WEIGHTS = {
  certifications: 15,
  administratif: 25,
  technique: 25,
  references: 10,
  financier: 10,
  ressources: 8,
  planning: 7,
} as const;

export type Level2Category = keyof typeof LEVEL_2_CATEGORY_WEIGHTS;

/** Seuils de recommandation IA Niveau 2 (mission §17, décision produit confirmée). Un blocage
 *  éliminatoire détecté reste TOUJOURS affiché séparément (`blockers`), quel que soit le score —
 *  ne transforme jamais automatiquement la recommandation (mission §16 "ne jamais bloquer
 *  automatiquement la décision humaine"). */
export const RECOMMENDATION_THRESHOLDS = {
  go: 75,
  goConditional: 50,
} as const;

/** Score global pondéré — jamais une moyenne arithmétique simple : chaque catégorie contribue au
 *  prorata de son poids documenté ci-dessus. */
export function computeWeightedGlobalScore(categoryScores: ReadonlyMap<string, { score: number; weight: number }>): number {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const { score, weight } of categoryScores.values()) {
    weightedSum += score * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return 0;
  return Math.round((weightedSum / totalWeight) * 100) / 100;
}
