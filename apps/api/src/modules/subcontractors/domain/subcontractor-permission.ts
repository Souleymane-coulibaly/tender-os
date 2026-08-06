/**
 * Mission §7 : le répertoire des sous-traitants est ORGANISATIONNEL (jamais scopé à un
 * `ClientAccount`) — une matrice dédiée indexée par le rôle d'organisation, jamais une réutilisation
 * de `ClientPermission` (qui suppose un `ClientAssignment`, non pertinent ici) ni un second système
 * de permissions générique : même motif que `OrganizationPermission` (module Memberships), propre à
 * ce bounded context. `OrganizationRole` n'étant pas réexporté publiquement par `memberships`
 * (seul `actorRole: string` circule entre modules, même convention que tous les autres bounded
 * contexts), les rôles sont ici les valeurs stables déjà utilisées partout ailleurs comme
 * `membership.role` (ex. `AdministrativeDossierController`).
 */
export const SubcontractorPermission = {
  Read: "subcontractor:read",
  Manage: "subcontractor:manage",
  Archive: "subcontractor:archive",
} as const;
export type SubcontractorPermission = (typeof SubcontractorPermission)[keyof typeof SubcontractorPermission];

const ROLE_SUBCONTRACTOR_PERMISSIONS: Record<string, readonly SubcontractorPermission[]> = {
  OWNER: [SubcontractorPermission.Read, SubcontractorPermission.Manage, SubcontractorPermission.Archive],
  ORGANIZATION_ADMIN: [SubcontractorPermission.Read, SubcontractorPermission.Manage, SubcontractorPermission.Archive],
  BID_MANAGER: [SubcontractorPermission.Read, SubcontractorPermission.Manage, SubcontractorPermission.Archive],
  CONTRIBUTOR: [SubcontractorPermission.Read, SubcontractorPermission.Manage],
  REVIEWER: [SubcontractorPermission.Read],
  EXECUTIVE: [SubcontractorPermission.Read],
  EXTERNAL_CONSULTANT: [SubcontractorPermission.Read],
  READ_ONLY: [SubcontractorPermission.Read],
};

export function roleHasSubcontractorPermission(role: string, permission: SubcontractorPermission): boolean {
  const permissions = ROLE_SUBCONTRACTOR_PERMISSIONS[role];
  return permissions ? permissions.includes(permission) : false;
}
