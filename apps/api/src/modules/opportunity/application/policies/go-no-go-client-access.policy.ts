import { AssertClientAccessUseCase, ClientAccountNotFoundError, type ClientPermission, ClientPermissionMissingError } from "../../../client-portfolio";

const ADMIN_BYPASS_ROLES = new Set(["OWNER", "ORGANIZATION_ADMIN"]);

export type GoNoGoClientAccessResult = Readonly<{ viaAdminBypass: boolean }>;

/**
 * Mission Sprint 5 §19/§21 (audit Codex, round 2 — P1 confirmé) — `RecordGoNoGoDecision`/
 * `PromoteOpportunity` sont volontairement EXCLUES du bypass organisation-tier silencieux habituel
 * (`ClientPermission`'s `PORTFOLIO_PERMISSIONS`) : le chemin normal exige une affectation
 * CLIENT_MANAGER réelle sur le client précis, y compris pour OWNER/ORGANIZATION_ADMIN. Un filet de
 * sécurité anti-lockout reste accordé à CES DEUX RÔLES SEULEMENT (jamais BID_MANAGER/CONTRIBUTOR) :
 * sans affectation CLIENT_MANAGER valide, ils peuvent tout de même agir via leur "privilège
 * d'administration" — mais ce contournement est TRACÉ (`viaAdminBypass: true`) : l'appelant DOIT
 * (a) exiger une justification explicite quelle que soit la décision (voir
 * `GoNoGoAdminBypassJustificationRequiredError`) et (b) l'enregistrer dans l'AuditLog. Jamais
 * utilisé pour d'autres permissions Opportunity (Create/Update/ComputeQuickScore restent sur le
 * bypass silencieux habituel, `assertOpportunityClientAccessAllowed`).
 */
export async function resolveGoNoGoClientAccess(input: {
  assertClientAccessUseCase: AssertClientAccessUseCase;
  organizationId: string;
  clientAccountId: string | undefined;
  actorId: string;
  actorRole: string;
  permission: ClientPermission;
}): Promise<GoNoGoClientAccessResult> {
  if (input.clientAccountId === undefined) {
    // Aucun candidat résolu (Opportunity uniquement) — rien à contourner : seule la permission
    // organisation-tier déjà vérifiée par l'appelant s'applique. Jamais compté comme un bypass
    // administratif (il n'y a pas encore de client dont l'affectation pourrait être contournée).
    return { viaAdminBypass: false };
  }

  try {
    await input.assertClientAccessUseCase.execute({
      organizationId: input.organizationId,
      clientAccountId: input.clientAccountId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      permission: input.permission,
    });
    return { viaAdminBypass: false };
  } catch (error) {
    if (!(error instanceof ClientAccountNotFoundError || error instanceof ClientPermissionMissingError)) {
      throw error;
    }
    if (ADMIN_BYPASS_ROLES.has(input.actorRole)) {
      return { viaAdminBypass: true };
    }
    throw error;
  }
}
