// V2 Sprint 25 (Dashboard Premium) — mission §25.56/§25.66/§25.67 "Ne jamais afficher une action
// inaccessible au user." Même motif UI-only que `canManageBilling`/`canUseMarketWatch` (mirroir du
// backend, jamais l'autorité — chaque action cible revalide toujours côté serveur) :
// `ROLE_TENDER_PERMISSIONS`/`OrganizationPermission.MemberInvite` (apps/api/.../tenders/domain/
// tender-permission.ts, .../memberships/domain/organization-permission.ts).

const TENDER_CREATE_ROLES = ["OWNER", "ORGANIZATION_ADMIN", "BID_MANAGER"];
export function canCreateTender(role: string | undefined): boolean {
  return role !== undefined && TENDER_CREATE_ROLES.includes(role);
}

const WORKSPACE_MANAGE_ROLES = ["OWNER", "ORGANIZATION_ADMIN", "BID_MANAGER", "CONTRIBUTOR"];
/** Importer un DCE / Ajouter un document — actions de workspace, même palier que
 *  `TenderPermission.ManageWorkspace`. */
export function canManageWorkspace(role: string | undefined): boolean {
  return role !== undefined && WORKSPACE_MANAGE_ROLES.includes(role);
}
