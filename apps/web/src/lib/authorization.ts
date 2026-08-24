/**
 * Checkpoint TENDEROS-2.1-P2.3-E6 (RBAC & Capability-Aware UI V2) — audit §11/§12/§42 : la paire de
 * rôles OWNER/ORGANIZATION_ADMIN revient à l'identique dans ~13 fonctions locales indépendantes
 * (`canManageAi` x8 dans `ai-configuration/**`, `canManageGeneration` x2 dans
 * `ai-configuration/prompts/**`, `canManageAssignments` dans `clients/[id]/page.tsx`,
 * `canManageMembers` dans `dashboard-permissions.ts`) — chacune reflète un permission backend
 * DIFFÉRENT (AiBenchmarkPermission, DocumentGenerationPermission, ClientPermission,
 * OrganizationPermission.MemberInvite/RoleAssign) qui se trouve simplement accorder EXACTEMENT ce
 * même palier "OWNER/ORGANIZATION_ADMIN seuls" (mirroir §12 : "ne pas créer un second moteur RBAC" —
 * ceci ne remplace aucune de ces permissions, ça déduplique seulement le TEST de palier de rôle
 * qu'elles partagent par coïncidence).
 *
 * Chaque capability garde son propre nom métier au point d'appel (jamais un `isOrganizationAdmin()`
 * nu dans une page — perdrait le lien vers la permission backend qu'elle mirrore) : les fonctions
 * locales deviennent un alias d'une ligne vers ce test partagé, jamais supprimées.
 */
export const ORGANIZATION_ADMIN_TIER = ["OWNER", "ORGANIZATION_ADMIN"] as const;

export function isOrganizationAdmin(role: string | undefined): boolean {
  return role !== undefined && (ORGANIZATION_ADMIN_TIER as readonly string[]).includes(role);
}
