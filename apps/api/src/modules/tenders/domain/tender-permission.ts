/**
 * Permissions Tenders — réutilise les rôles Memberships (`OrganizationRole`) déjà
 * implémentés (mission Tenders §15 : "respecter strictement Organizations et Memberships").
 * Certaines permissions reprennent le catalogue documenté (`bible/03-domain/permissions.md`
 * §8 : tender:read, tender:update, tender:archive) ; `tender:create`, `tender:list`,
 * `tender:manage_checklist`, `tender:manage_risks`, `tender:manage_alerts` sont de nouvelles
 * permissions justifiées par le périmètre inédit de ce module (création manuelle, checklist,
 * risques, alertes — non couverts par le catalogue de découverte/qualification existant).
 * Non persistées dans la table `permissions` partagée (dédiée à Memberships) : matrice en
 * code, même motif que Platform Administration.
 */
export const TenderPermission = {
  Create: "tender:create",
  Read: "tender:read",
  List: "tender:list",
  Update: "tender:update",
  Archive: "tender:archive",
  ManageChecklist: "tender:manage_checklist",
  ManageRisks: "tender:manage_risks",
  ManageAlerts: "tender:manage_alerts",
} as const;

export type TenderPermission = (typeof TenderPermission)[keyof typeof TenderPermission];

/**
 * Matrice proposée par moi (aucune matrice CRUD Tenders n'est documentée) — dérivée de la
 * description des rôles (`permissions.md` §4) et de la matrice de lecture existante (§26) :
 * Bid Manager pilote les Tenders (tout) ; Contributor produit le contenu (lecture + checklist) ;
 * Reviewer/Executive/External/ReadOnly restent en lecture seule dans cette tranche.
 * OWNER (correction réaudit Codex Sprint 4.1 P1-01-R) — superset strict de ORGANIZATION_ADMIN
 * (même motif que ROLE_PERMISSIONS dans memberships/domain/organization-permission.ts et
 * ROLE_ANALYSIS_PERMISSIONS) : le propriétaire d'organisation ne doit jamais se retrouver sans
 * permission Tenders (y compris `tender:read`, requis par `GetTenderUseCase`, lui-même appelé par
 * StartTenderAnalysisUseCase/StartDocumentAnalysisUseCase — sans cette entrée, OWNER ne pouvait
 * déclencher aucune analyse malgré une matrice Analysis correcte).
 */
export const ROLE_TENDER_PERMISSIONS: Record<string, readonly TenderPermission[]> = {
  OWNER: Object.values(TenderPermission),
  ORGANIZATION_ADMIN: Object.values(TenderPermission),
  BID_MANAGER: Object.values(TenderPermission),
  CONTRIBUTOR: [TenderPermission.Read, TenderPermission.List, TenderPermission.ManageChecklist],
  REVIEWER: [TenderPermission.Read, TenderPermission.List],
  EXECUTIVE: [TenderPermission.Read, TenderPermission.List],
  EXTERNAL_CONSULTANT: [TenderPermission.Read, TenderPermission.List],
  READ_ONLY: [TenderPermission.Read, TenderPermission.List],
};

export function roleHasTenderPermission(role: string, permission: TenderPermission): boolean {
  return (ROLE_TENDER_PERMISSIONS[role] ?? []).includes(permission);
}
