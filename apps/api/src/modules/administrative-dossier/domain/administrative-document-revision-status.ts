import { InvalidAdministrativeDocumentRevisionStatusTransitionError } from "./errors";

/**
 * Sprint 8C Phase 1 — cycle de vie d'UNE révision de pièce administrative (mission §21), même
 * discipline que `DeliverableRevisionStatus` : VALIDATED/REJECTED/REPLACED/ARCHIVED sont terminaux,
 * une modification après VALIDATED crée toujours une NOUVELLE révision, jamais une réécriture.
 */
export const AdministrativeDocumentRevisionStatus = {
  Draft: "DRAFT",
  InReview: "IN_REVIEW",
  Validated: "VALIDATED",
  Rejected: "REJECTED",
  Replaced: "REPLACED",
  Archived: "ARCHIVED",
} as const;

export type AdministrativeDocumentRevisionStatus = (typeof AdministrativeDocumentRevisionStatus)[keyof typeof AdministrativeDocumentRevisionStatus];

export const ALLOWED_ADMINISTRATIVE_DOCUMENT_REVISION_TRANSITIONS: Record<AdministrativeDocumentRevisionStatus, readonly AdministrativeDocumentRevisionStatus[]> = {
  [AdministrativeDocumentRevisionStatus.Draft]: [AdministrativeDocumentRevisionStatus.InReview, AdministrativeDocumentRevisionStatus.Archived],
  [AdministrativeDocumentRevisionStatus.InReview]: [
    AdministrativeDocumentRevisionStatus.Draft,
    AdministrativeDocumentRevisionStatus.Validated,
    AdministrativeDocumentRevisionStatus.Rejected,
  ],
  [AdministrativeDocumentRevisionStatus.Validated]: [AdministrativeDocumentRevisionStatus.Replaced],
  [AdministrativeDocumentRevisionStatus.Rejected]: [AdministrativeDocumentRevisionStatus.Archived],
  [AdministrativeDocumentRevisionStatus.Replaced]: [],
  [AdministrativeDocumentRevisionStatus.Archived]: [],
};

export function canTransitionAdministrativeDocumentRevisionStatus(from: AdministrativeDocumentRevisionStatus, to: AdministrativeDocumentRevisionStatus): boolean {
  return ALLOWED_ADMINISTRATIVE_DOCUMENT_REVISION_TRANSITIONS[from].includes(to);
}

export function assertAdministrativeDocumentRevisionStatusTransition(from: AdministrativeDocumentRevisionStatus, to: AdministrativeDocumentRevisionStatus): void {
  if (!canTransitionAdministrativeDocumentRevisionStatus(from, to)) {
    throw new InvalidAdministrativeDocumentRevisionStatusTransitionError({ from, to });
  }
}

export function isAdministrativeDocumentRevisionStatus(value: string): value is AdministrativeDocumentRevisionStatus {
  return Object.values(AdministrativeDocumentRevisionStatus).includes(value as AdministrativeDocumentRevisionStatus);
}
