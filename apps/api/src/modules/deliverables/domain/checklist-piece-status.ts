/** Mission §14 — statut d'une pièce de la checklist des pièces à fournir. */
export const ChecklistPieceStatus = {
  Missing: "MISSING",
  Provided: "PROVIDED",
  Expired: "EXPIRED",
  Rejected: "REJECTED",
  Valid: "VALID",
} as const;

export type ChecklistPieceStatus = (typeof ChecklistPieceStatus)[keyof typeof ChecklistPieceStatus];

export function isChecklistPieceStatus(value: string): value is ChecklistPieceStatus {
  return Object.values(ChecklistPieceStatus).includes(value as ChecklistPieceStatus);
}
