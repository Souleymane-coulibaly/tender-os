import { TenderOperationNotEntitledError } from "../../domain/errors";
import type { EntitlementService } from "../services/entitlement.service";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 1 — mécanisme UNIQUE, réutilisable, pour gater les
 * opérations "cœur AO" (DCE/Analyse/Mémoire technique/SubmissionPackage/Submission) sur
 * `EntitlementService.canOperateOnTender` — jamais un `if (plan === ...)` local dupliqué à chaque
 * point d'entrée (mission "interdiction explicite"). Même motif exact que `assertEntitlementFeature`
 * (fonctionnalités différenciantes) — celui-ci gate le PLAN/PASS lui-même, pas une feature du
 * catalogue (mission §13 : ces opérations existent sur tous les paliers payants, jamais modélisées
 * en `EntitlementFeature`). Toujours composé AVEC RBAC/ClientAccess par l'appelant, jamais à la
 * place — ce garde-fou ne sait rien des rôles.
 */
export async function assertTenderOperationEntitled(entitlementService: EntitlementService, organizationId: string, tenderId: string): Promise<void> {
  const allowed = await entitlementService.canOperateOnTender(organizationId, tenderId);
  if (!allowed) {
    throw new TenderOperationNotEntitledError(organizationId, tenderId);
  }
}
