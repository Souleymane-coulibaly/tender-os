/**
 * Permissions Knowledge Base — même motif que `DocumentPermission`/`AnalysisPermission`/
 * `TenderPermission` : matrice en code, indexée sur les rôles `OrganizationRole` déjà implémentés
 * par Memberships, aucune nouvelle table ni système de rôles indépendant.
 */
export const KnowledgePermission = {
  Read: "knowledge:read",
  Search: "knowledge:search",
  Create: "knowledge:create",
  Update: "knowledge:update",
  ImportDocument: "knowledge:import_document",
  Reprocess: "knowledge:reprocess",
  ManageTags: "knowledge:manage_tags",
  Archive: "knowledge:archive",
  Restore: "knowledge:restore",
  Delete: "knowledge:delete",
  /** V2 Sprint 8 §15/§16/§21 — décision de confiance, palier Admin uniquement (même motif que
   *  `TenderPermission.ValidateWorkspace`, Sprint 7) : jamais accordée au CONTRIBUTOR. */
  Validate: "knowledge:validate",
} as const;

export type KnowledgePermission = (typeof KnowledgePermission)[keyof typeof KnowledgePermission];

const VIEWER_PERMISSIONS: readonly KnowledgePermission[] = [KnowledgePermission.Read, KnowledgePermission.Search];

/** Mission §"MEMBER" — lire, rechercher, créer, modifier, importer si autorisé — jamais supprimer
 *  ni gérer les tags globalement (même palier que `DocumentPermission` CONTRIBUTOR, qui n'a pas non
 *  plus `Delete`). */
const CONTRIBUTOR_PERMISSIONS: readonly KnowledgePermission[] = [
  ...VIEWER_PERMISSIONS,
  KnowledgePermission.Create,
  KnowledgePermission.Update,
  KnowledgePermission.ImportDocument,
  KnowledgePermission.Reprocess,
  KnowledgePermission.ManageTags,
  KnowledgePermission.Archive,
  KnowledgePermission.Restore,
];

const ADMIN_PERMISSIONS: readonly KnowledgePermission[] = Object.values(KnowledgePermission);

/**
 * Mapping (palier → rôles réels), parité avec `ROLE_DOCUMENT_PERMISSIONS` — OWNER inclus dès la
 * création de cette matrice (contrairement à `ROLE_DOCUMENT_PERMISSIONS`, qui date d'avant la
 * correction d'audit Codex P1-01 ; jamais reproduire ici l'anomalie déjà corrigée ailleurs pour
 * Tenders/Extraction/Analysis). Admin = OWNER, ORGANIZATION_ADMIN, BID_MANAGER (parité avec leur
 * périmètre complet sur Documents) ; Contributor = CONTRIBUTOR ; Viewer = REVIEWER, EXECUTIVE,
 * EXTERNAL_CONSULTANT, READ_ONLY. Un rôle inconnu ne reçoit aucun droit (tableau vide par défaut).
 */
export const ROLE_KNOWLEDGE_PERMISSIONS: Record<string, readonly KnowledgePermission[]> = {
  OWNER: ADMIN_PERMISSIONS,
  ORGANIZATION_ADMIN: ADMIN_PERMISSIONS,
  BID_MANAGER: ADMIN_PERMISSIONS,
  CONTRIBUTOR: CONTRIBUTOR_PERMISSIONS,
  REVIEWER: VIEWER_PERMISSIONS,
  EXECUTIVE: VIEWER_PERMISSIONS,
  EXTERNAL_CONSULTANT: VIEWER_PERMISSIONS,
  READ_ONLY: VIEWER_PERMISSIONS,
};

export function roleHasKnowledgePermission(role: string, permission: KnowledgePermission): boolean {
  return (ROLE_KNOWLEDGE_PERMISSIONS[role] ?? []).includes(permission);
}
