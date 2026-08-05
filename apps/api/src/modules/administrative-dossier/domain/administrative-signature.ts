import { InvalidAdministrativeSignatureStatusTransitionError } from "./errors";

/**
 * Sprint 8C Phase 2 — mission §18 : la signature électronique n'est JAMAIS obligatoire globalement.
 * Modélisation LOCALE (pas un second moteur de signature) : le module Signature existant est
 * structurellement couplé aux artefacts d'Export (`SignatureTransaction.exportArtifactId`) —
 * l'intégrer en profondeur pour un document administratif exigerait une refonte hors périmètre de
 * cette passe. `ELECTRONIC` reste un mode acceptable et persistable ici, mais le déclenchement réel
 * d'un workflow (Universign) n'est PAS câblé — documenté, pas construit sans validation explicite.
 */
export const AdministrativeSignatureMode = {
  NotRequired: "NOT_REQUIRED",
  Manual: "MANUAL",
  Electronic: "ELECTRONIC",
  External: "EXTERNAL",
} as const;

export type AdministrativeSignatureMode = (typeof AdministrativeSignatureMode)[keyof typeof AdministrativeSignatureMode];

export const AdministrativeSignatureStatus = {
  NotRequired: "NOT_REQUIRED",
  Pending: "PENDING",
  Signed: "SIGNED",
  Rejected: "REJECTED",
  Expired: "EXPIRED",
  Cancelled: "CANCELLED",
} as const;

export type AdministrativeSignatureStatus = (typeof AdministrativeSignatureStatus)[keyof typeof AdministrativeSignatureStatus];

/** Mission §18 — "ne jamais créer automatiquement PENDING lorsqu'aucune signature n'est
 *  nécessaire" : PENDING n'apparaît jamais seul, toujours en tandem avec un mode réellement requis
 *  (posé par `setSignatureMode`, jamais par cette table de transitions). */
export const ALLOWED_ADMINISTRATIVE_SIGNATURE_STATUS_TRANSITIONS: Record<AdministrativeSignatureStatus, readonly AdministrativeSignatureStatus[]> = {
  [AdministrativeSignatureStatus.NotRequired]: [],
  [AdministrativeSignatureStatus.Pending]: [
    AdministrativeSignatureStatus.Signed,
    AdministrativeSignatureStatus.Rejected,
    AdministrativeSignatureStatus.Expired,
    AdministrativeSignatureStatus.Cancelled,
  ],
  [AdministrativeSignatureStatus.Signed]: [],
  [AdministrativeSignatureStatus.Rejected]: [],
  [AdministrativeSignatureStatus.Expired]: [],
  [AdministrativeSignatureStatus.Cancelled]: [],
};

export function canTransitionAdministrativeSignatureStatus(from: AdministrativeSignatureStatus, to: AdministrativeSignatureStatus): boolean {
  return ALLOWED_ADMINISTRATIVE_SIGNATURE_STATUS_TRANSITIONS[from].includes(to);
}

export function assertAdministrativeSignatureStatusTransition(from: AdministrativeSignatureStatus, to: AdministrativeSignatureStatus): void {
  if (!canTransitionAdministrativeSignatureStatus(from, to)) {
    throw new InvalidAdministrativeSignatureStatusTransitionError({ from, to });
  }
}
