import { InvalidDeliverableRevisionStatusTransitionError } from "./errors";

/**
 * Mission Sprint 8A.1 §10/§11 — cycle de vie d'UNE révision (jamais du couple section/révision) :
 * "une ancienne révision ne doit jamais être écrasée" — VALIDATED et ARCHIVED sont terminaux et
 * définitifs. Une modification après VALIDATED ne rouvre JAMAIS cette ligne : elle crée une
 * NOUVELLE révision (`previousRevisionId` pointant ici), qui démarre elle-même à DRAFT (mission
 * §11 "une modification post-validation crée un nouveau brouillon, jamais une modification de la
 * version validée").
 */
export const DeliverableRevisionStatus = {
  Draft: "DRAFT",
  ReadyForReview: "READY_FOR_REVIEW",
  ChangesRequested: "CHANGES_REQUESTED",
  Validated: "VALIDATED",
  Rejected: "REJECTED",
  Archived: "ARCHIVED",
} as const;

export type DeliverableRevisionStatus = (typeof DeliverableRevisionStatus)[keyof typeof DeliverableRevisionStatus];

export const ALLOWED_DELIVERABLE_REVISION_TRANSITIONS: Record<DeliverableRevisionStatus, readonly DeliverableRevisionStatus[]> = {
  [DeliverableRevisionStatus.Draft]: [DeliverableRevisionStatus.ReadyForReview, DeliverableRevisionStatus.Archived],
  // Retour possible à DRAFT depuis READY_FOR_REVIEW — retrait explicite de la revue avant toute
  // décision, jamais après (mission §13 "une décision de revue est toujours liée à une révision
  // exacte" : une fois APPROVED/CHANGES_REQUESTED/REJECTED décidé, voir ci-dessous).
  [DeliverableRevisionStatus.ReadyForReview]: [
    DeliverableRevisionStatus.Draft,
    DeliverableRevisionStatus.Validated,
    DeliverableRevisionStatus.ChangesRequested,
    DeliverableRevisionStatus.Rejected,
  ],
  [DeliverableRevisionStatus.ChangesRequested]: [DeliverableRevisionStatus.Archived],
  [DeliverableRevisionStatus.Rejected]: [DeliverableRevisionStatus.Archived],
  [DeliverableRevisionStatus.Validated]: [],
  [DeliverableRevisionStatus.Archived]: [],
};

export function canTransitionDeliverableRevisionStatus(from: DeliverableRevisionStatus, to: DeliverableRevisionStatus): boolean {
  return ALLOWED_DELIVERABLE_REVISION_TRANSITIONS[from].includes(to);
}

export function assertDeliverableRevisionStatusTransition(from: DeliverableRevisionStatus, to: DeliverableRevisionStatus): void {
  if (!canTransitionDeliverableRevisionStatus(from, to)) {
    throw new InvalidDeliverableRevisionStatusTransitionError({ from, to });
  }
}

export function isDeliverableRevisionStatus(value: string): value is DeliverableRevisionStatus {
  return Object.values(DeliverableRevisionStatus).includes(value as DeliverableRevisionStatus);
}

/** Une révision non-DRAFT est figée (mission §9/§10 "une ancienne révision ne doit jamais être
 *  écrasée") — seul un statut DRAFT autorise `applyEdit`. */
export function isEditableDeliverableRevisionStatus(status: DeliverableRevisionStatus): boolean {
  return status === DeliverableRevisionStatus.Draft;
}
