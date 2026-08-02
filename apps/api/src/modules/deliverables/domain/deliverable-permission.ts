/**
 * Capacités ORG-WIDE de gestion des templates de mémoire et de l'identité documentaire uniquement
 * (mission §17 "Gérer templates : Non [pour MEMBER]" / "Gérer thème organisation : Non [pour
 * MEMBER]" — jamais délégable via un rôle client) — même motif qu'`ExportPermission.ManageExportTemplates`
 * (Sprint 8A) et `GenerationPermission.ManagePromptTemplates` (Sprint 6).
 *
 * Les actions Tender/client-scopées (voir/générer/éditer/réviser/valider/sélectionner-pour-export/
 * exporter un livrable) ne passent PAS par cet enum : elles réutilisent `AssertClientAccessUseCase`
 * de client-portfolio avec `ReadDeliverable`/`ManageDeliverable`/`ValidateDeliverable` (voir
 * client-portfolio/domain/client-permission.ts).
 */
export const DeliverablePermission = {
  ManageDeliverableTemplates: "DELIVERABLE_MANAGE_TEMPLATES",
  ManageDocumentThemes: "DELIVERABLE_MANAGE_THEMES",
} as const;

export type DeliverablePermission = (typeof DeliverablePermission)[keyof typeof DeliverablePermission];

const ALL_PERMISSIONS: readonly DeliverablePermission[] = Object.values(DeliverablePermission);

export const ROLE_DELIVERABLE_PERMISSIONS: Record<string, readonly DeliverablePermission[]> = {
  OWNER: ALL_PERMISSIONS,
  ORGANIZATION_ADMIN: ALL_PERMISSIONS,
  BID_MANAGER: [],
  CONTRIBUTOR: [],
  REVIEWER: [],
  EXECUTIVE: [],
  EXTERNAL_CONSULTANT: [],
  READ_ONLY: [],
};

export function roleHasDeliverablePermission(role: string, permission: DeliverablePermission): boolean {
  return (ROLE_DELIVERABLE_PERMISSIONS[role] ?? []).includes(permission);
}
