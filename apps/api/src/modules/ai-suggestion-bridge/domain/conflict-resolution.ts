/**
 * V2 Sprint 4 §12 — décision explicite exigée lorsque la cible d'une suggestion porte déjà une
 * valeur. Aucune fusion automatique de texte complexe (mission) : MERGE reste borné aux types
 * compatibles (voir `domain/merge.ts`), jamais autorisé pour dates/montants/statuts/booléens/
 * SIRET/pondérations/identifiants juridiques/relations métier.
 */
export const ConflictResolution = {
  KeepCurrent: "KEEP_CURRENT",
  Replace: "REPLACE",
  Merge: "MERGE",
  Reject: "REJECT",
} as const;

export type ConflictResolution = (typeof ConflictResolution)[keyof typeof ConflictResolution];

export const CONFLICT_RESOLUTIONS: readonly ConflictResolution[] = Object.values(ConflictResolution);
