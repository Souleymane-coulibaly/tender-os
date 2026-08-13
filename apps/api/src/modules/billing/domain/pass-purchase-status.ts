import { InvalidPassPurchaseStatusError } from "./errors";

/**
 * V2 Sprint 22 (billing, étape 22A) — jamais de statut EXPIRED en colonne : la politique de durée
 * commerciale du Pass n'est pas tranchée (mission §10). `isPassPurchaseExpired` calcule
 * l'expiration à la LECTURE à partir de `expiresAt` (nullable), même motif que
 * `OrganizationMembership.expiresAt`. Un Pass expiré reste `AVAILABLE` en base — l'expiration est
 * une question d'ACCÈS (peut-on encore le consommer), jamais de RÉTENTION (mission §9 : les
 * données produites via un Pass ne sont jamais supprimées à l'expiration).
 */
export const PassPurchaseStatus = {
  Available: "AVAILABLE",
  Consumed: "CONSUMED",
} as const;

export type PassPurchaseStatus = (typeof PassPurchaseStatus)[keyof typeof PassPurchaseStatus];

export function isPassPurchaseStatus(value: string): value is PassPurchaseStatus {
  return Object.values(PassPurchaseStatus).includes(value as PassPurchaseStatus);
}

export function parsePassPurchaseStatus(value: string): PassPurchaseStatus {
  if (!isPassPurchaseStatus(value)) {
    throw new InvalidPassPurchaseStatusError(value);
  }
  return value;
}

export function isPassPurchaseExpired(expiresAt: Date | null, now: Date = new Date()): boolean {
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}
