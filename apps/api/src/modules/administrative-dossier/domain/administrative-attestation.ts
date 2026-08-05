/**
 * Sprint 8C Phase 2 — mission §16 : cycle de validité d'une attestation. Fonction PURE, réutilisée
 * par la checklist enrichie (une ligne EXPIRE calculée ici, jamais par une seconde logique
 * divergente) — même discipline que `computeAdministrativeChecklist`. "La présence d'un fichier ne
 * suffit jamais à rendre une attestation valide" : `NOT_VERIFIED` tant qu'aucune révision n'est
 * VALIDÉE, quel que soit le nombre de fichiers attachés.
 */
export const AdministrativeAttestationStatus = {
  Valid: "VALID",
  ExpiringSoon: "EXPIRING_SOON",
  Expired: "EXPIRED",
  NotVerified: "NOT_VERIFIED",
  Rejected: "REJECTED",
} as const;

export type AdministrativeAttestationStatus = (typeof AdministrativeAttestationStatus)[keyof typeof AdministrativeAttestationStatus];

const DEFAULT_EXPIRING_SOON_WINDOW_DAYS = 30;

export function deriveAttestationStatus(input: {
  hasValidatedRevision: boolean;
  latestRevisionRejected: boolean;
  expiresAt?: Date | undefined;
  now: Date;
  tenderDeadline?: Date | undefined;
  expiringSoonWindowDays?: number | undefined;
}): AdministrativeAttestationStatus {
  if (input.latestRevisionRejected && !input.hasValidatedRevision) {
    return AdministrativeAttestationStatus.Rejected;
  }
  if (!input.hasValidatedRevision) {
    return AdministrativeAttestationStatus.NotVerified;
  }
  if (input.expiresAt) {
    if (input.expiresAt.getTime() < input.now.getTime()) {
      return AdministrativeAttestationStatus.Expired;
    }
    const windowDays = input.expiringSoonWindowDays ?? DEFAULT_EXPIRING_SOON_WINDOW_DAYS;
    const soonThreshold = new Date(input.now.getTime() + windowDays * 24 * 60 * 60 * 1000);
    const expiresBeforeDeadline = input.tenderDeadline !== undefined && input.expiresAt.getTime() < input.tenderDeadline.getTime() && input.expiresAt.getTime() > input.now.getTime();
    if (input.expiresAt.getTime() < soonThreshold.getTime() || expiresBeforeDeadline) {
      return AdministrativeAttestationStatus.ExpiringSoon;
    }
  }
  return AdministrativeAttestationStatus.Valid;
}
