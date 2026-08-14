import { BillingManagementPermissionMissingError } from "../../domain/errors";

/**
 * V2 Sprint 22 (billing, étape 22C) — initier un paiement/consulter le Customer Portal reste une
 * action de niveau organisation, jamais Platform Admin (distinct de `PlatformCapability.AoCredits*`,
 * réservé aux corrections exceptionnelles). Restreint à OWNER/ORGANIZATION_ADMIN — même esprit que
 * "Organization Admin ne peut pas modifier son propre solde" (mission §31) : n'importe quel membre
 * ne doit pas pouvoir engager la carte bancaire de l'organisation.
 */
const ALLOWED_ROLES = new Set(["OWNER", "ORGANIZATION_ADMIN"]);

export function assertCanManageBilling(actorRole: string): void {
  if (!ALLOWED_ROLES.has(actorRole)) {
    throw new BillingManagementPermissionMissingError();
  }
}
