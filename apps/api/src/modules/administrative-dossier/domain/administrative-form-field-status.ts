/** Mission V2 Sprint 11 §20 — statut d'un champ de formulaire officiel face aux données métier
 *  réellement disponibles. Jamais un pourcentage marketing opaque : chaque champ obtient un
 *  statut explicable, jamais une valeur inventée pour combler un `MISSING`. */
export const AdministrativeFormFieldStatus = {
  Available: "AVAILABLE",
  Missing: "MISSING",
  NotApplicable: "NOT_APPLICABLE",
  NeedsReview: "NEEDS_REVIEW",
} as const;

export type AdministrativeFormFieldStatus = (typeof AdministrativeFormFieldStatus)[keyof typeof AdministrativeFormFieldStatus];
