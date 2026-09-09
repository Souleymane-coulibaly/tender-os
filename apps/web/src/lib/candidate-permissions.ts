/**
 * Checkpoint TENDEROS-2.1-CCV2-F — miroir FIDÈLE de `CandidatePermission` (backend CCV2-A,
 * `apps/api/src/modules/candidate-company/domain/candidate-permission.ts`).
 *
 * Ce n'est PAS un second moteur RBAC : c'est la même matrice, recopiée à l'identique, pour décider
 * ce que l'interface propose. L'autorité reste intégralement backend — chaque mutation est
 * revalidée par `CandidateCapabilityAccessService`, quoi que montre l'écran. Masquer un bouton est
 * un confort d'usage, jamais une protection.
 *
 * Une divergence entre cette table et la table backend serait un défaut d'interface (une action
 * proposée puis refusée en 403, ou une action légitime rendue introuvable) : `candidate-permissions.
 * test.ts` la vérifie ligne à ligne.
 */
export const CandidatePermission = {
  Read: "candidate:read",
  ManageIdentity: "candidate:manage_identity",
  CapabilityEdit: "candidate:capability_edit",
  DocumentUpload: "candidate:document_upload",
  DocumentDelete: "candidate:document_delete",
  ReadBanking: "candidate:read_banking",
  ManageBanking: "candidate:manage_banking",
} as const;
export type CandidatePermission = (typeof CandidatePermission)[keyof typeof CandidatePermission];

const ALL: readonly CandidatePermission[] = Object.values(CandidatePermission);
const READ_ONLY: readonly CandidatePermission[] = [CandidatePermission.Read];
const CONTRIBUTOR: readonly CandidatePermission[] = [CandidatePermission.Read, CandidatePermission.CapabilityEdit, CandidatePermission.DocumentUpload];

export const ROLE_CANDIDATE_PERMISSIONS: Record<string, readonly CandidatePermission[]> = {
  OWNER: ALL,
  ORGANIZATION_ADMIN: ALL,
  BID_MANAGER: ALL,
  CONTRIBUTOR,
  REVIEWER: READ_ONLY,
  EXECUTIVE: READ_ONLY,
  EXTERNAL_CONSULTANT: READ_ONLY,
  READ_ONLY,
};

/** Rôle inconnu ou absent ⇒ aucune capacité. Refus par défaut, exactement comme le backend. */
export function roleHasCandidatePermission(role: string | undefined, permission: CandidatePermission): boolean {
  if (role === undefined) return false;
  return (ROLE_CANDIDATE_PERMISSIONS[role] ?? []).includes(permission);
}

/**
 * Capacités d'interface d'un rôle, résolues UNE FOIS par page et passées aux sections — plutôt que
 * de disséminer des tests de rôle dans chaque composant, ce qui finirait par diverger.
 */
export type CandidateUiCapabilities = Readonly<{
  canRead: boolean;
  canEditIdentity: boolean;
  canEditCapabilities: boolean;
  canUploadDocuments: boolean;
  canDeleteDocuments: boolean;
  canReadBanking: boolean;
  canManageBanking: boolean;
}>;

export function resolveCandidateUiCapabilities(role: string | undefined): CandidateUiCapabilities {
  return {
    canRead: roleHasCandidatePermission(role, CandidatePermission.Read),
    canEditIdentity: roleHasCandidatePermission(role, CandidatePermission.ManageIdentity),
    canEditCapabilities: roleHasCandidatePermission(role, CandidatePermission.CapabilityEdit),
    canUploadDocuments: roleHasCandidatePermission(role, CandidatePermission.DocumentUpload),
    canDeleteDocuments: roleHasCandidatePermission(role, CandidatePermission.DocumentDelete),
    canReadBanking: roleHasCandidatePermission(role, CandidatePermission.ReadBanking),
    canManageBanking: roleHasCandidatePermission(role, CandidatePermission.ManageBanking),
  };
}
