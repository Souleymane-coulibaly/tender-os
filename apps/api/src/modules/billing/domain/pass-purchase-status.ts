import { InvalidPassPurchaseStatusError } from "./errors";

/**
 * V2 Sprint 22 (billing, étape 22A) — jamais de statut EXPIRED en colonne : la politique de durée
 * commerciale du Pass n'est pas tranchée (mission §10). `isPassPurchaseExpired` calcule
 * l'expiration à la LECTURE à partir de `expiresAt` (nullable), même motif que
 * `OrganizationMembership.expiresAt`. Un Pass expiré reste `AVAILABLE` en base — l'expiration est
 * une question d'ACCÈS (peut-on encore le consommer), jamais de RÉTENTION (mission §9 : les
 * données produites via un Pass ne sont jamais supprimées à l'expiration).
 *
 * Checkpoint TENDEROS-2.1-P2.3-E1.2 — `RESERVED` : état intermédiaire ajouté entre `AVAILABLE` et
 * `CONSUMED` (mission "1 Pass AO = 1 Tender / 1 AO" — un Pass disponible ne doit plus permettre de
 * préparer plusieurs Tenders simultanément). Distinct de `CONSUMED` : la réservation n'est PAS la
 * consommation commerciale finale (qui reste au premier dépôt réussi) — voir
 * `PassPurchase.reserveForTender`/`consumeForTender`.
 */
export const PassPurchaseStatus = {
  Available: "AVAILABLE",
  Reserved: "RESERVED",
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
