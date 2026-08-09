/** Statut MÉTIER d'une révision — mission "generation != business validation" : une génération
 *  techniquement COMPLETED reste GENERATED tant que personne ne l'a relue/validée. Aucune règle de
 *  transition imposée ce sprint (pas de workflow d'approbation métier — groundwork Sprint 11+). */
export const ReviewStatus = {
  Generated: "GENERATED",
  Reviewed: "REVIEWED",
  Validated: "VALIDATED",
} as const;

export type ReviewStatus = (typeof ReviewStatus)[keyof typeof ReviewStatus];
