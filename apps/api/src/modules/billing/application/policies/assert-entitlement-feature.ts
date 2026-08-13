import { EntitlementFeatureNotAvailableError } from "../../domain/errors";
import type { EntitlementFeature } from "../../domain/entitlement-feature";
import type { EntitlementContext, EntitlementService } from "../services/entitlement.service";

/**
 * Correctif audit Codex 22A (P1-01) — point d'entrée unique pour gater une fonctionnalité
 * différenciante (mission §13 "POINT BLOQUANT" : jamais un simple masquage frontend). Toujours
 * composé AVEC RBAC/ClientAccess par l'appelant (mission §23), jamais à la place.
 */
export async function assertEntitlementFeature(
  entitlementService: EntitlementService,
  organizationId: string,
  feature: EntitlementFeature,
  context?: EntitlementContext,
): Promise<void> {
  const allowed = await entitlementService.canUseFeature(organizationId, feature, context);
  if (!allowed) {
    throw new EntitlementFeatureNotAvailableError(feature);
  }
}
