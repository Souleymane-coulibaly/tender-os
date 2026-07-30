/**
 * Recommandation go/no-go indicative (mission Sprint 4.2 §8 "Synthèse métier structurée") —
 * IMPORTANT (mission) : une aide à la décision, JAMAIS une décision automatique définitive. Toute
 * présentation de cette valeur (API, frontend) doit rester accompagnée de `goNoGoRationale` et
 * d'une mise en garde explicite ; jamais utilisée pour bloquer ou déclencher automatiquement une
 * action métier (soumission, archivage, etc. — hors périmètre de toute façon, Sprint 4.2 n'écrit
 * jamais dans le workflow Tender existant).
 */
export const GoNoGoRecommendation = {
  Go: "GO",
  GoWithReservations: "GO_WITH_RESERVATIONS",
  NoGo: "NO_GO",
  InsufficientData: "INSUFFICIENT_DATA",
} as const;

export type GoNoGoRecommendation = (typeof GoNoGoRecommendation)[keyof typeof GoNoGoRecommendation];

export function isGoNoGoRecommendation(value: string): value is GoNoGoRecommendation {
  return Object.values(GoNoGoRecommendation).includes(value as GoNoGoRecommendation);
}
