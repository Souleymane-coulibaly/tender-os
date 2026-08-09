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
  /** V2 Sprint 5 (GO/NO-GO IA) — `ManageGoNoGo` (générer/régénérer un GoNoGoReport, purement
   *  informatif) et `RecordGoNoGoDecision` restent toutes deux accordées à BID_MANAGER via le
   *  superset ci-dessous : ce palier ORGANISATION reste volontairement large (même motif que le
   *  reste de cette matrice), la restriction fine "CLIENT_MANAGER uniquement" (audit Codex round 2,
   *  P1 confirmé) vit ENTIÈREMENT au palier client (voir `opportunity/application/policies/go-no-go-
   *  client-access.policy.ts#resolveGoNoGoClientAccess`) — sans affectation CLIENT_MANAGER réelle
   *  sur le client du Tender, BID_MANAGER reste rejeté à CE palier-là, jamais ici. La LECTURE d'un
   *  rapport/d'une décision reste couverte par `TenderPermission.Read`, déjà accordée au CONTRIBUTOR
   *  — aucune nouvelle permission de lecture nécessaire. */
  ManageGoNoGo: "tender:manage_go_no_go",
  RecordGoNoGoDecision: "tender:record_go_no_go_decision",
  /** V2 Sprint 7 (Workspace collaboratif) — `ManageWorkspace` (participants/tâches/commentaires,
   *  même palier que `ManageChecklist`, CONTRIBUTOR inclus) vs. `ValidateWorkspace` (approbations,
   *  "règle stricte" — mission §29/§41, jamais délégué au CONTRIBUTOR). La restriction fine
   *  "CLIENT_MANAGER uniquement" pour la validation vit ENTIÈREMENT au palier client
   *  (`ClientPermission.ValidateWorkspace`), même motif dual-tier déjà établi par
   *  `ManageGoNoGo`/`RecordGoNoGoDecision` ci-dessus : ce palier ORGANISATION reste volontairement
   *  large.
   */
  ManageWorkspace: "tender:manage_workspace",
  ValidateWorkspace: "tender:validate_workspace",
  /** V2 Sprint 9 (Chat IA conversationnel) — même palier que `ManageWorkspace` (CONTRIBUTOR inclus,
   *  jamais READ_ONLY/REVIEWER/EXECUTIVE/EXTERNAL_CONSULTANT) : envoyer un message au Chat reste une
   *  action de production de contenu, pas une action réservée. La LECTURE (consulter une conversation
   *  existante) reste couverte par `TenderPermission.Read`, déjà accordée à tous les rôles ci-dessous —
   *  la restriction fine "lecture uniquement si ClientPermission.ReadChat" vit au palier client
   *  (`assertChatAccess`), jamais ici. */
  UseChat: "tender:use_chat",
  /** V2 Sprint 10 (Moteur documentaire — Templates DOCX) — même palier que `UseChat` (CONTRIBUTOR
   *  inclus, jamais READ_ONLY/REVIEWER/EXECUTIVE/EXTERNAL_CONSULTANT) : lancer/régénérer une
   *  génération documentaire est une action de production de contenu, pas une action réservée. La
   *  LECTURE (consulter/télécharger un document déjà généré) reste couverte par `TenderPermission.
   *  Read`, déjà accordée à tous les rôles ci-dessous — la restriction fine "lecture uniquement si
   *  ClientPermission.ReadDocumentGeneration" vit au palier client (`assertDocumentGenerationAccess`),
   *  jamais ici. */
  UseDocumentGeneration: "tender:use_document_generation",
  /** V2 Sprint 11 (Dossier administratif — préremplissage DC1/DC2/DC4) — même palier que
   *  `UseDocumentGeneration` (CONTRIBUTOR inclus) : générer un formulaire administratif officiel
   *  reste une action de production de contenu (DRAFT), pas une action réservée. Consulter le
   *  dossier/la readiness/la preview reste couvert par `TenderPermission.Read`, déjà accordé à
   *  tous les rôles ci-dessous — mission §51/§52 "un utilisateur peut consulter sans pouvoir
   *  générer" : la restriction fine vit au palier client (`ClientPermission.
   *  GenerateAdministrativeForm`, via `assertAdministrativeFormAccess`), jamais ici. */
  GenerateAdministrativeForm: "tender:generate_administrative_form",
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
  CONTRIBUTOR: [
    TenderPermission.Read,
    TenderPermission.List,
    TenderPermission.ManageChecklist,
    TenderPermission.ManageWorkspace,
    TenderPermission.UseChat,
    TenderPermission.UseDocumentGeneration,
    TenderPermission.GenerateAdministrativeForm,
  ],
  REVIEWER: [TenderPermission.Read, TenderPermission.List],
  EXECUTIVE: [TenderPermission.Read, TenderPermission.List],
  EXTERNAL_CONSULTANT: [TenderPermission.Read, TenderPermission.List],
  READ_ONLY: [TenderPermission.Read, TenderPermission.List],
};

export function roleHasTenderPermission(role: string, permission: TenderPermission): boolean {
  return (ROLE_TENDER_PERMISSIONS[role] ?? []).includes(permission);
}
