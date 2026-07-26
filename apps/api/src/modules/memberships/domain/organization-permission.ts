import { OrganizationRole } from "./organization-role";

/**
 * Sous-ensemble des permissions Organization réellement appliqué par ce module
 * (bible/03-domain/permissions.md §7 "Membres" — notation canonique `resource:action`).
 * N'inclut pas les permissions organization:read/update/profile/settings/security/subscription,
 * qui ne sont vérifiées par aucun use case de ce module (hors périmètre Memberships).
 */
export const OrganizationPermission = {
  MemberList: "organization:member:list",
  MemberInvite: "organization:member:invite",
  MemberSuspend: "organization:member:suspend",
  MemberRemove: "organization:member:remove",
  RoleAssign: "organization:role:assign",
} as const;

export type OrganizationPermission = (typeof OrganizationPermission)[keyof typeof OrganizationPermission];

/**
 * Attribution rôle → permissions (bible/03-domain/permissions.md §4) : seul "Organization Admin"
 * a explicitement "gérer les membres ; gérer les rôles" dans sa description. Aucune matrice
 * rôle→permission détaillée n'existe pour les 6 autres rôles vis-à-vis des permissions
 * organization:member: et organization:role: — appliqué ici : refus par défaut (PERM-001),
 * aucune permission accordée.
 */
export const ROLE_PERMISSIONS: Record<OrganizationRole, readonly OrganizationPermission[]> = {
  [OrganizationRole.OrganizationAdmin]: [
    OrganizationPermission.MemberList,
    OrganizationPermission.MemberInvite,
    OrganizationPermission.MemberSuspend,
    OrganizationPermission.MemberRemove,
    OrganizationPermission.RoleAssign,
  ],
  [OrganizationRole.BidManager]: [],
  [OrganizationRole.Contributor]: [],
  [OrganizationRole.Reviewer]: [],
  [OrganizationRole.Executive]: [],
  [OrganizationRole.ExternalConsultant]: [],
  [OrganizationRole.ReadOnly]: [],
};

export function roleHasPermission(role: OrganizationRole, permission: OrganizationPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
