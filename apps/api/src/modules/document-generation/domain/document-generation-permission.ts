/**
 * Capacités ORG-WIDE de gestion des templates documentaires uniquement — même motif qu'
 * `ExportPermission` (Sprint 8A) : gérer (upload/version/activer/archiver) un template reste
 * réservé à OWNER/ORGANIZATION_ADMIN, jamais délégable via un rôle client.
 *
 * Les actions Tender-scopées (lancer une génération, consulter/télécharger une révision) ne
 * passent PAS par cet enum : elles réutilisent `AssertClientAccessUseCase` de client-portfolio
 * avec `ReadDocumentGeneration`/`ManageDocumentGeneration` (voir client-permission.ts), même motif
 * dual-tier que Chat/Export/Deliverables.
 */
export const DocumentGenerationPermission = {
  ReadTemplates: "DOCUMENT_GENERATION_READ_TEMPLATES",
  ManageTemplates: "DOCUMENT_GENERATION_MANAGE_TEMPLATES",
} as const;

export type DocumentGenerationPermission = (typeof DocumentGenerationPermission)[keyof typeof DocumentGenerationPermission];

const READ_ONLY: readonly DocumentGenerationPermission[] = [DocumentGenerationPermission.ReadTemplates];
const ALL_PERMISSIONS: readonly DocumentGenerationPermission[] = Object.values(DocumentGenerationPermission);

export const ROLE_DOCUMENT_GENERATION_PERMISSIONS: Record<string, readonly DocumentGenerationPermission[]> = {
  OWNER: ALL_PERMISSIONS,
  ORGANIZATION_ADMIN: ALL_PERMISSIONS,
  BID_MANAGER: READ_ONLY,
  CONTRIBUTOR: READ_ONLY,
  REVIEWER: READ_ONLY,
  EXECUTIVE: READ_ONLY,
  EXTERNAL_CONSULTANT: READ_ONLY,
  READ_ONLY: READ_ONLY,
};

export function roleHasDocumentGenerationPermission(role: string, permission: DocumentGenerationPermission): boolean {
  return (ROLE_DOCUMENT_GENERATION_PERMISSIONS[role] ?? []).includes(permission);
}
