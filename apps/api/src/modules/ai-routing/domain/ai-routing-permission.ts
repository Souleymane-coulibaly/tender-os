import { AiRoutingPermissionMissingError } from "./errors";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E4 — préférence de modèle IA personnelle, même motif que
 * `market-watch/domain/market-watch-permission.ts` : un réglage de confort individuel, jamais une
 * configuration sensible d'organisation (celle-ci reste `AiBenchmarkPermission`/`RoutingPolicy`,
 * OWNER/ORGANIZATION_ADMIN uniquement, inchangée). Palier large (tout rôle actif), à l'exception de
 * READ_ONLY/EXTERNAL_CONSULTANT (même exclusion que Market Watch).
 */
export const AiRoutingPermission = {
  ManageOwnPreferences: "ai_routing:manage_own_preferences",
} as const;

export type AiRoutingPermission = (typeof AiRoutingPermission)[keyof typeof AiRoutingPermission];

const ALL_PERMISSIONS = Object.values(AiRoutingPermission);

export const ROLE_AI_ROUTING_PERMISSIONS: Record<string, readonly AiRoutingPermission[]> = {
  OWNER: ALL_PERMISSIONS,
  ORGANIZATION_ADMIN: ALL_PERMISSIONS,
  BID_MANAGER: ALL_PERMISSIONS,
  CONTRIBUTOR: ALL_PERMISSIONS,
  REVIEWER: ALL_PERMISSIONS,
  EXECUTIVE: ALL_PERMISSIONS,
  EXTERNAL_CONSULTANT: [],
  READ_ONLY: [],
};

export function roleHasAiRoutingPermission(role: string, permission: AiRoutingPermission): boolean {
  return (ROLE_AI_ROUTING_PERMISSIONS[role] ?? []).includes(permission);
}

export function assertHasAiRoutingPermission(role: string, permission: AiRoutingPermission): void {
  if (!roleHasAiRoutingPermission(role, permission)) {
    throw new AiRoutingPermissionMissingError();
  }
}
