/**
 * Permissions AiSuggestion — même motif que `document-permission.ts`/`dce-permission.ts` :
 * matrice en code, indexée sur les rôles `OrganizationRole` déjà implémentés par Memberships,
 * aucune nouvelle table ni système de rôles indépendant (mission Sprint 1 §4 "réutiliser...
 * sans créer un second système de permissions").
 *
 * Sprint 1 : seule la vérification d'organisation + rôle est en place (baseline). La résolution
 * fine par entité cible (Entreprise candidate/Opportunity/Tender/Document) est explicitement
 * différée aux sprints qui introduiront ces mappers métier (mission §4 "prévoir les bases...
 * sans créer ces fonctionnalités dans ce sprint").
 */
export const AiSuggestionPermission = {
  Read: "ai_suggestion:read",
  Decide: "ai_suggestion:decide",
} as const;

export type AiSuggestionPermission = (typeof AiSuggestionPermission)[keyof typeof AiSuggestionPermission];

const READ_ONLY_PERMISSIONS: readonly AiSuggestionPermission[] = [AiSuggestionPermission.Read];
const DECIDER_PERMISSIONS: readonly AiSuggestionPermission[] = Object.values(AiSuggestionPermission);

export const ROLE_AI_SUGGESTION_PERMISSIONS: Record<string, readonly AiSuggestionPermission[]> = {
  OWNER: DECIDER_PERMISSIONS,
  ORGANIZATION_ADMIN: DECIDER_PERMISSIONS,
  BID_MANAGER: DECIDER_PERMISSIONS,
  CONTRIBUTOR: DECIDER_PERMISSIONS,
  REVIEWER: READ_ONLY_PERMISSIONS,
  EXECUTIVE: READ_ONLY_PERMISSIONS,
  EXTERNAL_CONSULTANT: READ_ONLY_PERMISSIONS,
  READ_ONLY: READ_ONLY_PERMISSIONS,
};

export function roleHasAiSuggestionPermission(role: string, permission: AiSuggestionPermission): boolean {
  return (ROLE_AI_SUGGESTION_PERMISSIONS[role] ?? []).includes(permission);
}
