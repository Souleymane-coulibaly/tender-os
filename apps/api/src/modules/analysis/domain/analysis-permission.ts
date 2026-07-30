/**
 * Permissions Analysis — même motif que `ExtractionPermission` (module Extraction, Sprint 3) :
 * matrice en code, indexée sur les rôles `OrganizationRole` déjà implémentés par Memberships.
 * Read = consulter un job ; Trigger = lancer/relancer une analyse ; Cancel = annuler un job en
 * cours (mission §"Autorisation" : lister explicitement qui peut lancer/relancer/lire/annuler).
 */
export const AnalysisPermission = {
  Read: "analysis:read",
  Trigger: "analysis:trigger",
  Cancel: "analysis:cancel",
} as const;

export type AnalysisPermission = (typeof AnalysisPermission)[keyof typeof AnalysisPermission];

const VIEWER_PERMISSIONS: readonly AnalysisPermission[] = [AnalysisPermission.Read];

const CONTRIBUTOR_PERMISSIONS: readonly AnalysisPermission[] = [
  ...VIEWER_PERMISSIONS,
  AnalysisPermission.Trigger,
  AnalysisPermission.Cancel,
];

const ADMIN_PERMISSIONS: readonly AnalysisPermission[] = Object.values(AnalysisPermission);

/** Parité avec ROLE_EXTRACTION_PERMISSIONS : Admin = ORGANIZATION_ADMIN, BID_MANAGER ;
 *  Contributor = CONTRIBUTOR ; Viewer = REVIEWER, EXECUTIVE, EXTERNAL_CONSULTANT, READ_ONLY.
 *  OWNER (correction audit Codex Sprint 4.1 P1-01) — superset strict de ORGANIZATION_ADMIN
 *  (même motif que ROLE_PERMISSIONS dans memberships/domain/organization-permission.ts) : le
 *  propriétaire d'organisation ne doit jamais se retrouver sans permission Analysis alors qu'il
 *  a par définition au moins les droits d'un ORGANIZATION_ADMIN. */
export const ROLE_ANALYSIS_PERMISSIONS: Record<string, readonly AnalysisPermission[]> = {
  OWNER: ADMIN_PERMISSIONS,
  ORGANIZATION_ADMIN: ADMIN_PERMISSIONS,
  BID_MANAGER: ADMIN_PERMISSIONS,
  CONTRIBUTOR: CONTRIBUTOR_PERMISSIONS,
  REVIEWER: VIEWER_PERMISSIONS,
  EXECUTIVE: VIEWER_PERMISSIONS,
  EXTERNAL_CONSULTANT: VIEWER_PERMISSIONS,
  READ_ONLY: VIEWER_PERMISSIONS,
};

export function roleHasAnalysisPermission(role: string, permission: AnalysisPermission): boolean {
  return (ROLE_ANALYSIS_PERMISSIONS[role] ?? []).includes(permission);
}
