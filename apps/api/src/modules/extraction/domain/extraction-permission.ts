/**
 * Permissions Extraction — même motif que `DcePermission`/`DocumentPermission` : matrice en code,
 * indexée sur les rôles `OrganizationRole` déjà implémentés par Memberships. Read = consulter
 * statut/contenu ; Trigger = déclencher/relancer une extraction (mission Sprint 3 §17
 * "authentification → membership → organisation → Tender → DCE → document → permission").
 */
export const ExtractionPermission = {
  Read: "extraction:read",
  Trigger: "extraction:trigger",
} as const;

export type ExtractionPermission = (typeof ExtractionPermission)[keyof typeof ExtractionPermission];

const VIEWER_PERMISSIONS: readonly ExtractionPermission[] = [ExtractionPermission.Read];

const CONTRIBUTOR_PERMISSIONS: readonly ExtractionPermission[] = [
  ...VIEWER_PERMISSIONS,
  ExtractionPermission.Trigger,
];

const ADMIN_PERMISSIONS: readonly ExtractionPermission[] = Object.values(ExtractionPermission);

/** Parité avec ROLE_DCE_PERMISSIONS : Admin = ORGANIZATION_ADMIN, BID_MANAGER ; Contributor =
 *  CONTRIBUTOR ; Viewer = REVIEWER, EXECUTIVE, EXTERNAL_CONSULTANT, READ_ONLY.
 *  OWNER (correction réaudit Codex Sprint 4.1 P1-01-R) — superset strict de ORGANIZATION_ADMIN,
 *  même motif que ROLE_TENDER_PERMISSIONS/ROLE_ANALYSIS_PERMISSIONS : sans cette entrée,
 *  `GetDocumentAnalysisInputUseCase` (appelé par StartDocumentAnalysisUseCase) rejetait tout
 *  propriétaire d'organisation avec `EXTRACTION_PERMISSION_MISSING`, même une fois la matrice
 *  Analysis elle-même corrigée. */
export const ROLE_EXTRACTION_PERMISSIONS: Record<string, readonly ExtractionPermission[]> = {
  OWNER: ADMIN_PERMISSIONS,
  ORGANIZATION_ADMIN: ADMIN_PERMISSIONS,
  BID_MANAGER: ADMIN_PERMISSIONS,
  CONTRIBUTOR: CONTRIBUTOR_PERMISSIONS,
  REVIEWER: VIEWER_PERMISSIONS,
  EXECUTIVE: VIEWER_PERMISSIONS,
  EXTERNAL_CONSULTANT: VIEWER_PERMISSIONS,
  READ_ONLY: VIEWER_PERMISSIONS,
};

export function roleHasExtractionPermission(role: string, permission: ExtractionPermission): boolean {
  return (ROLE_EXTRACTION_PERMISSIONS[role] ?? []).includes(permission);
}
