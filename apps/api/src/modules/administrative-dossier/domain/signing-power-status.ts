/** Sprint 8C Phase 2 — mission §17 : "la présence d'un fichier ne suffit jamais à rendre un
 *  pouvoir valide" — `UNVERIFIED` tant qu'aucune vérification humaine explicite n'a eu lieu, quel
 *  que soit le document attaché. Fonction PURE, même discipline que `deriveAttestationStatus`. */
export const SigningPowerStatus = {
  Unverified: "UNVERIFIED",
  Valid: "VALID",
  Expired: "EXPIRED",
} as const;

export type SigningPowerStatus = (typeof SigningPowerStatus)[keyof typeof SigningPowerStatus];

export function deriveSigningPowerStatus(input: { verifiedAt?: Date | undefined; expiresAt?: Date | undefined; now: Date }): SigningPowerStatus {
  if (!input.verifiedAt) {
    return SigningPowerStatus.Unverified;
  }
  if (input.expiresAt && input.expiresAt.getTime() < input.now.getTime()) {
    return SigningPowerStatus.Expired;
  }
  return SigningPowerStatus.Valid;
}
