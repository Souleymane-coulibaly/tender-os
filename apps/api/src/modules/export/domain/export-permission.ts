/**
 * Capacités ORG-WIDE de gestion des templates d'export uniquement (mission Sprint 8A §16/§56
 * "Gérer templates : OWNER/ADMIN uniquement, jamais délégable via un rôle client") — même motif
 * qu'`GenerationPermission.ManagePromptTemplates` (Sprint 6).
 *
 * Les actions Tender-scopées (aperçu, export final, validation, signature, package) ne passent
 * PAS par cet enum : elles réutilisent `AssertClientAccessUseCase` de client-portfolio avec
 * `ReadExport`/`ManageExport`/`ApproveExport` (voir client-portfolio/domain/client-permission.ts).
 */
export const ExportPermission = {
  ReadExportTemplates: "EXPORT_READ_TEMPLATES",
  ManageExportTemplates: "EXPORT_MANAGE_TEMPLATES",
} as const;

export type ExportPermission = (typeof ExportPermission)[keyof typeof ExportPermission];

const READ_ONLY: readonly ExportPermission[] = [ExportPermission.ReadExportTemplates];
const ALL_PERMISSIONS: readonly ExportPermission[] = Object.values(ExportPermission);

export const ROLE_EXPORT_PERMISSIONS: Record<string, readonly ExportPermission[]> = {
  OWNER: ALL_PERMISSIONS,
  ORGANIZATION_ADMIN: ALL_PERMISSIONS,
  BID_MANAGER: READ_ONLY,
  CONTRIBUTOR: READ_ONLY,
  REVIEWER: READ_ONLY,
  EXECUTIVE: READ_ONLY,
  EXTERNAL_CONSULTANT: READ_ONLY,
  READ_ONLY: READ_ONLY,
};

export function roleHasExportPermission(role: string, permission: ExportPermission): boolean {
  return (ROLE_EXPORT_PERMISSIONS[role] ?? []).includes(permission);
}
