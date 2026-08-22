/**
 * Checkpoint TENDEROS-2.1-P2.3-E1, mission §15 — port possédé par `memberships` (jamais un import
 * direct de `billing`, qui importe déjà `MembershipsModule` — l'inverse créerait un cycle à 2 nœuds,
 * voir `memberships.module.ts`). Lié à une implémentation réelle par un module-pont `@Global()`
 * (même motif que `AiSuggestionBridgeModule`/`RoutingPolicyBridgeModule` déjà en place dans ce
 * dépôt), injecté `@Optional()` — jamais un second moteur de quota, uniquement une lecture de la
 * limite `USERS_MAX` déjà résolue par `EntitlementService` (billing).
 */
export interface SeatLimitProvider {
  /** `"UNLIMITED"` (Enterprise/fair-use) ou un nombre de sièges — jamais recalculé ici. */
  getSeatLimit(organizationId: string): Promise<number | "UNLIMITED">;
}

export const SEAT_LIMIT_PROVIDER = Symbol("SEAT_LIMIT_PROVIDER");
