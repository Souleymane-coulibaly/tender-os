/**
 * Permissions Documents — même motif que `tender-permission.ts` : matrice en code, indexée
 * sur les rôles `OrganizationRole` déjà implémentés par Memberships, aucune nouvelle table
 * ni système de rôles indépendant (décision validée).
 *
 * Trois paliers fonctionnels demandés (Viewer / Contributor / Admin) — non matérialisés
 * comme un type à part : ils ne sont qu'un regroupement conceptuel de la matrice ci-dessous,
 * exactement comme Tenders regroupe informellement ses rôles en "pilote / producteur / lecteur".
 */
export const DocumentPermission = {
  Read: "document:read",
  Download: "document:download",
  Create: "document:create",
  UploadVersion: "document:upload_version",
  Update: "document:update",
  AttachToTender: "document:attach_to_tender",
  Archive: "document:archive",
  Restore: "document:restore",
  Delete: "document:delete",
} as const;

export type DocumentPermission = (typeof DocumentPermission)[keyof typeof DocumentPermission];

const VIEWER_PERMISSIONS: readonly DocumentPermission[] = [DocumentPermission.Read, DocumentPermission.Download];

const CONTRIBUTOR_PERMISSIONS: readonly DocumentPermission[] = [
  ...VIEWER_PERMISSIONS,
  DocumentPermission.Create,
  DocumentPermission.UploadVersion,
  DocumentPermission.Update,
  DocumentPermission.AttachToTender,
];

const ADMIN_PERMISSIONS: readonly DocumentPermission[] = Object.values(DocumentPermission);

/**
 * Mapping validé (conception, palier → rôles réels) :
 * Admin = ORGANIZATION_ADMIN, BID_MANAGER (parité avec leur périmètre complet sur Tenders) ;
 * Contributor = CONTRIBUTOR ;
 * Viewer = REVIEWER, EXECUTIVE, EXTERNAL_CONSULTANT, READ_ONLY.
 * OWNER (correction Sprint 5 — même motif que la correction d'audit Codex P1-01 déjà appliquée à
 * Tenders/Extraction/Analysis) — superset strict de ORGANIZATION_ADMIN : sans cette entrée, un
 * propriétaire d'organisation ne pouvait pas importer de document pour la base de connaissances
 * (`CreateKnowledgeEntryUseCase`/`AddKnowledgeDocumentUseCase` délèguent à
 * `CreateDocumentWithFirstVersionUseCase`, qui vérifie `DocumentPermission.Create` avec le rôle
 * réel de l'acteur) — nécessité technique démontrée par ce Sprint, jamais une modification
 * opportuniste.
 */
export const ROLE_DOCUMENT_PERMISSIONS: Record<string, readonly DocumentPermission[]> = {
  OWNER: ADMIN_PERMISSIONS,
  ORGANIZATION_ADMIN: ADMIN_PERMISSIONS,
  BID_MANAGER: ADMIN_PERMISSIONS,
  CONTRIBUTOR: CONTRIBUTOR_PERMISSIONS,
  REVIEWER: VIEWER_PERMISSIONS,
  EXECUTIVE: VIEWER_PERMISSIONS,
  EXTERNAL_CONSULTANT: VIEWER_PERMISSIONS,
  READ_ONLY: VIEWER_PERMISSIONS,
};

export function roleHasDocumentPermission(role: string, permission: DocumentPermission): boolean {
  return (ROLE_DOCUMENT_PERMISSIONS[role] ?? []).includes(permission);
}
