/**
 * Permissions DCE — même motif que `document-permission.ts` : matrice en code, indexée sur les
 * rôles `OrganizationRole` déjà implémentés par Memberships, aucune nouvelle table ni système de
 * rôles indépendant.
 *
 * Mission Sprint 1 §"contrôles" : "les rôles en lecture seule ne peuvent pas importer, remplacer
 * ou supprimer" — le palier Viewer se limite donc à Read/Download, exactement comme Documents.
 * Delete reste réservé au palier Admin (parité avec Documents, où Archive/Restore/Delete sont
 * également réservés à l'Admin) : rien dans la mission n'exige d'assouplir ce point pour le DCE.
 */
export const DcePermission = {
  Read: "dce:read",
  Download: "dce:download",
  Create: "dce:create",
  Import: "dce:import",
  Replace: "dce:replace",
  Delete: "dce:delete",
} as const;

export type DcePermission = (typeof DcePermission)[keyof typeof DcePermission];

const VIEWER_PERMISSIONS: readonly DcePermission[] = [DcePermission.Read, DcePermission.Download];

const CONTRIBUTOR_PERMISSIONS: readonly DcePermission[] = [
  ...VIEWER_PERMISSIONS,
  DcePermission.Create,
  DcePermission.Import,
  DcePermission.Replace,
];

const ADMIN_PERMISSIONS: readonly DcePermission[] = Object.values(DcePermission);

/**
 * Mapping (parité avec ROLE_DOCUMENT_PERMISSIONS) :
 * Admin = ORGANIZATION_ADMIN, BID_MANAGER ; Contributor = CONTRIBUTOR ;
 * Viewer = REVIEWER, EXECUTIVE, EXTERNAL_CONSULTANT, READ_ONLY.
 *
 * OWNER (audit Cockpit Bid Manager, Sprint 8A.2) — superset strict de ORGANIZATION_ADMIN, même
 * correctif déjà appliqué à Documents (Sprint 5) et Analysis (Sprint 4.1, audit Codex P1-01) mais
 * jamais porté ici : sans cette entrée, un propriétaire d'organisation ne pouvait lire ni gérer
 * AUCUN DCE (`DCE_PERMISSION_MISSING` sur `GetDceUseCase`/`ListDceDocumentsUseCase`/etc., découvert
 * en écrivant le test d'intégration HTTP du module `cockpit`).
 */
export const ROLE_DCE_PERMISSIONS: Record<string, readonly DcePermission[]> = {
  OWNER: ADMIN_PERMISSIONS,
  ORGANIZATION_ADMIN: ADMIN_PERMISSIONS,
  BID_MANAGER: ADMIN_PERMISSIONS,
  CONTRIBUTOR: CONTRIBUTOR_PERMISSIONS,
  REVIEWER: VIEWER_PERMISSIONS,
  EXECUTIVE: VIEWER_PERMISSIONS,
  EXTERNAL_CONSULTANT: VIEWER_PERMISSIONS,
  READ_ONLY: VIEWER_PERMISSIONS,
};

export function roleHasDcePermission(role: string, permission: DcePermission): boolean {
  return (ROLE_DCE_PERMISSIONS[role] ?? []).includes(permission);
}
