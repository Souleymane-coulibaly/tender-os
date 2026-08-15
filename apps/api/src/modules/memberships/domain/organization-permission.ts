import { OrganizationRole } from "./organization-role";

/**
 * Sous-ensemble des permissions Organization réellement appliqué par ce module
 * (bible/03-domain/permissions.md §7 "Membres" — notation canonique `resource:action`).
 * N'inclut pas les permissions organization:read/settings/security/subscription,
 * qui ne sont vérifiées par aucun use case de ce module (hors périmètre Memberships).
 */
export const OrganizationPermission = {
  MemberList: "organization:member:list",
  MemberInvite: "organization:member:invite",
  MemberSuspend: "organization:member:suspend",
  MemberRemove: "organization:member:remove",
  RoleAssign: "organization:role:assign",
  /**
   * V2 Sprint 24 (onboarding, correctif sécurité IDOR) — `PATCH /organizations/me` (étape
   * "Entreprise" de l'onboarding, ancien `OrganizationsController` vulnérable) exige désormais
   * cette permission explicite, jamais uniquement l'appartenance à l'organisation.
   */
  ProfileUpdate: "organization:profile:update",
  /** Réservées à OWNER (bible/03-domain/permissions.md §4 "Owner") — jamais accordées à
   *  ORGANIZATION_ADMIN, quel que soit son périmètre par ailleurs. */
  OrganizationDelete: "organization:delete",
  OwnershipTransfer: "organization:ownership:transfer",
} as const;

export type OrganizationPermission = (typeof OrganizationPermission)[keyof typeof OrganizationPermission];

/**
 * Attribution rôle → permissions (bible/03-domain/permissions.md §4) : "Organization Admin"
 * a explicitement "gérer les membres ; gérer les rôles" dans sa description, mais jamais
 * la suppression de l'organisation ni le transfert de propriété — réservés à OWNER (superset
 * strict des permissions ORGANIZATION_ADMIN). Aucune matrice rôle→permission détaillée n'existe
 * pour les autres rôles vis-à-vis de ces permissions — appliqué ici : refus par défaut
 * (PERM-001), aucune permission accordée.
 */
const ORGANIZATION_ADMIN_PERMISSIONS: readonly OrganizationPermission[] = [
  OrganizationPermission.MemberList,
  OrganizationPermission.MemberInvite,
  OrganizationPermission.MemberSuspend,
  OrganizationPermission.MemberRemove,
  OrganizationPermission.RoleAssign,
  OrganizationPermission.ProfileUpdate,
];

export const ROLE_PERMISSIONS: Record<OrganizationRole, readonly OrganizationPermission[]> = {
  [OrganizationRole.Owner]: [
    ...ORGANIZATION_ADMIN_PERMISSIONS,
    OrganizationPermission.OrganizationDelete,
    OrganizationPermission.OwnershipTransfer,
  ],
  [OrganizationRole.OrganizationAdmin]: ORGANIZATION_ADMIN_PERMISSIONS,
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
