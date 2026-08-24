// V2 Sprint 25 (Dashboard Premium) — mission §25.56/§25.66/§25.67 "Ne jamais afficher une action
// inaccessible au user." Même motif UI-only que `canManageBilling`/`canUseMarketWatch` (mirroir du
// backend, jamais l'autorité — chaque action cible revalide toujours côté serveur) :
// `ROLE_TENDER_PERMISSIONS`/`OrganizationPermission.MemberInvite` (apps/api/.../tenders/domain/
// tender-permission.ts, .../memberships/domain/organization-permission.ts).

import { isOrganizationAdmin } from "../../../lib/authorization";
import { canManageWorkspace as canManageWorkspaceShared } from "../../../lib/workspace-types";

const TENDER_CREATE_ROLES = ["OWNER", "ORGANIZATION_ADMIN", "BID_MANAGER"];
export function canCreateTender(role: string | undefined): boolean {
  return role !== undefined && TENDER_CREATE_ROLES.includes(role);
}

/** Importer un DCE / Ajouter un document — actions de workspace, même palier que
 *  `TenderPermission.ManageWorkspace`.
 *  Checkpoint TENDEROS-2.1-P2.3-E6 — délègue à `lib/workspace-types.ts` (audit §11/§12/§42 :
 *  même fonction, même logique, définie deux fois indépendamment ; celle-ci gardée comme
 *  ré-export pour ne casser aucun appelant existant de ce module). */
export const canManageWorkspace = canManageWorkspaceShared;

/** Checkpoint TENDEROS-2.1-P2.3-E1 (mission §14, problème E) — mirroir exact de
 *  `OrganizationPermission.MemberInvite`/`MemberSuspend`/`MemberRemove`/`RoleAssign`
 *  (apps/api/.../memberships/domain/organization-permission.ts, `ROLE_PERMISSIONS`) : seuls
 *  OWNER/ORGANIZATION_ADMIN les détiennent, jamais un autre rôle.
 *  Checkpoint TENDEROS-2.1-P2.3-E6 — palier OWNER/ORGANIZATION_ADMIN converge vers
 *  lib/authorization.ts (audit §11/§12/§42 : 13 réimplémentations locales identiques trouvées). */
export const canManageMembers = isOrganizationAdmin;
