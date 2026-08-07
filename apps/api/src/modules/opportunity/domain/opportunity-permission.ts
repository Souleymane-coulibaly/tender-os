/**
 * Permissions Opportunity/GO-NO-GO — même motif que `tenders/domain/tender-permission.ts` (matrice
 * en code, non persistée). Combinée avec `ClientPermission` (client-portfolio) quand
 * `Opportunity.clientAccountId` est résolu — voir `opportunity-client-access.policy.ts`.
 */
export const OpportunityPermission = {
  Create: "opportunity:create",
  Read: "opportunity:read",
  List: "opportunity:list",
  Update: "opportunity:update",
  Archive: "opportunity:archive",
  ComputeQuickScore: "opportunity:compute_quick_score",
  RecordDecision: "opportunity:record_decision",
  Promote: "opportunity:promote",
} as const;

export type OpportunityPermission = (typeof OpportunityPermission)[keyof typeof OpportunityPermission];

/**
 * Palier ORGANISATION — volontairement large (même motif que `TenderPermission`/
 * `ROLE_TENDER_PERMISSIONS` : "peut ce rôle toucher ce TYPE de ressource", pas "sur QUEL client
 * précis"). La restriction fine "CLIENT_MANAGER uniquement" (audit Codex round 2, P1 confirmé) vit
 * ENTIÈREMENT au palier client (`resolveGoNoGoClientAccess`), jamais ici — retirer `RecordDecision`/
 * `Promote` de BID_MANAGER à CE palier empêcherait à tort un membre au rôle organisation BID_MANAGER
 * mais explicitement affecté CLIENT_MANAGER sur un client précis (le "chemin normal" confirmé par
 * l'utilisateur) de jamais atteindre la vérification client-tier. OWNER/ORGANIZATION_ADMIN gardent
 * ce même superset ICI, mais perdent le bypass SILENCIEUX côté client-tier
 * (`PORTFOLIO_PERMISSIONS`, client-portfolio) pour `RecordGoNoGoDecision`/`PromoteOpportunity` :
 * sans affectation réelle, ils ne passent plus que via le filet de secours TRACÉ et justifié
 * (`resolveGoNoGoClientAccess`). CONTRIBUTOR reste exclu ICI de `RecordDecision`/`Promote` — décision
 * produit d'origine ("jamais CONTRIBUTOR"), indépendante du sujet du bypass administratif.
 */
export const ROLE_OPPORTUNITY_PERMISSIONS: Record<string, readonly OpportunityPermission[]> = {
  OWNER: Object.values(OpportunityPermission),
  ORGANIZATION_ADMIN: Object.values(OpportunityPermission),
  BID_MANAGER: Object.values(OpportunityPermission),
  CONTRIBUTOR: [
    OpportunityPermission.Create,
    OpportunityPermission.Read,
    OpportunityPermission.List,
    OpportunityPermission.Update,
    OpportunityPermission.Archive,
    OpportunityPermission.ComputeQuickScore,
  ],
  REVIEWER: [OpportunityPermission.Read, OpportunityPermission.List],
  EXECUTIVE: [OpportunityPermission.Read, OpportunityPermission.List],
  EXTERNAL_CONSULTANT: [OpportunityPermission.Read, OpportunityPermission.List],
  READ_ONLY: [OpportunityPermission.Read, OpportunityPermission.List],
};

export function roleHasOpportunityPermission(role: string, permission: OpportunityPermission): boolean {
  return (ROLE_OPPORTUNITY_PERMISSIONS[role] ?? []).includes(permission);
}
