import { AssertClientAccessUseCase, ClientAccountNotFoundError, type ClientPermission, ClientPermissionMissingError } from "../../../client-portfolio";

const ADMIN_BYPASS_ROLES = new Set(["OWNER", "ORGANIZATION_ADMIN"]);

export type WorkspaceClientAccessResult = Readonly<{ viaAdminBypass: boolean }>;

/**
 * V2 Sprint 7 §42 — mirroré sur `resolveGoNoGoClientAccess`
 * (`opportunity/application/policies/go-no-go-client-access.policy.ts`, mission §5 "bypass admin"
 * du Sprint 7), avec une distinction supplémentaire propre à ce cas d'usage : ici, l'accès vérifié
 * est celui du PARTICIPANT CIBLE (`targetUserId`/`targetUserRole` — la personne qu'on affecte au
 * Tender), tandis que l'ÉLIGIBILITÉ AU BYPASS reste celle de l'ACTEUR qui déclenche l'action
 * (`actorRole` — la personne qui ajoute). Ce sont deux identités distinctes (mission §7 : "on ne
 * peut affecter au Tender qu'un utilisateur... autorisé sur l'entreprise candidate concernée, sauf
 * bypass administratif"). Chemin normal d'abord (`AssertClientAccessUseCase` pour la cible) ;
 * bypass tracé réservé à OWNER/ORGANIZATION_ADMIN SEULEMENT en cas d'échec (jamais BID_MANAGER/
 * CONTRIBUTOR) — l'appelant DOIT (a) exiger une justification explicite quand `viaAdminBypass:
 * true` et (b) l'enregistrer dans l'AuditLog (`metadata: { clientAssignmentBypass: true }`).
 * Utilisé UNIQUEMENT pour `AddTenderParticipantUseCase` — jamais pour les tâches/commentaires
 * courants, qui restent gatés par `assertWorkspaceAccess` normal, sans bypass.
 */
export async function resolveWorkspaceClientAccess(input: {
  assertClientAccessUseCase: AssertClientAccessUseCase;
  organizationId: string;
  clientAccountId: string;
  targetUserId: string;
  targetUserRole: string;
  actorRole: string;
  permission: ClientPermission;
}): Promise<WorkspaceClientAccessResult> {
  try {
    await input.assertClientAccessUseCase.execute({
      organizationId: input.organizationId,
      clientAccountId: input.clientAccountId,
      actorId: input.targetUserId,
      actorRole: input.targetUserRole,
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
