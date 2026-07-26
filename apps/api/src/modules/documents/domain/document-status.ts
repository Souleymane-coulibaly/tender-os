/**
 * Cycle de vie du Document (conception validée §V.2) — strictement réservé à l'état actif/
 * archivé. La suppression logique est un axe orthogonal porté par `Document.deletedAt`
 * (même précédent que `User.deletedAt`/`Organization.deletedAt`), jamais un 3ᵉ statut.
 */
export const DocumentStatus = {
  Active: "ACTIVE",
  Archived: "ARCHIVED",
} as const;

export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];

export function isDocumentStatus(value: string): value is DocumentStatus {
  return Object.values(DocumentStatus).includes(value as DocumentStatus);
}
