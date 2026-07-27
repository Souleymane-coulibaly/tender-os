import { InvalidDceStatusError } from "./errors";

/**
 * Sprint 0/1 (fondations + import) : seuls DRAFT et IMPORTED sont réellement atteignables.
 *
 * Les états suivants sont volontairement réservés aux sprints futurs et ne sont ni stockés ni
 * atteignables par aucun cas d'usage de cette tranche (mission §4 — "ne conserver que les états
 * utiles à l'architecture actuelle") :
 * - IMPORTING     : nécessiterait un traitement asynchrone réel (Sprint 2).
 * - PROCESSING    : classification/extraction (Sprint 2).
 * - READY_FOR_REVIEW / VALIDATED : validation métier (sprint dédié, hors périmètre).
 * - ARCHIVED      : aucune action d'archivage du DCE n'est demandée dans ce sprint (l'archivage
 *   du Tender parent bloque déjà toute mutation via assertTenderNotArchivedForDceMutation).
 * - FAILED        : sans traitement asynchrone, aucune opération ne peut échouer en arrière-plan.
 */
export const DceStatus = {
  Draft: "DRAFT",
  Imported: "IMPORTED",
} as const;

export type DceStatus = (typeof DceStatus)[keyof typeof DceStatus];

export function isDceStatus(value: string): value is DceStatus {
  return Object.values(DceStatus).includes(value as DceStatus);
}

export function parseDceStatus(value: string): DceStatus {
  if (!isDceStatus(value)) {
    throw new InvalidDceStatusError(value);
  }
  return value;
}
