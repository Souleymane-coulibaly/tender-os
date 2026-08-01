/**
 * Capacités ORG-WIDE de Prompt Management uniquement (mission Sprint 6 §"Gérer prompts" /
 * "Activer prompts" — réservé à OWNER/ORGANIZATION_ADMIN, jamais délégable via une affectation
 * client). Même motif qu'`AiBenchmarkPermission` (Sprint 5.2) : un seul palier, pas de distinction
 * lecture/écriture par rôle client puisque cette capacité n'est pas liée à un client précis.
 *
 * Les actions de génération elles-mêmes (lancer/éditer/valider/annuler une Generation pour un
 * Tender donné) ne passent PAS par cet enum : elles réutilisent `AssertClientAccessUseCase` de
 * client-portfolio avec les permissions `ReadGeneration`/`ManageGeneration`/`ValidateGeneration`
 * (voir client-portfolio/domain/client-permission.ts) — la même policy d'accès client centralisée
 * que Tenders/Documents/Analysis/Knowledge Base, jamais recopiée ici.
 */
export const GenerationPermission = {
  ReadPromptTemplates: "GENERATION_READ_PROMPT_TEMPLATES",
  ManagePromptTemplates: "GENERATION_MANAGE_PROMPT_TEMPLATES",
} as const;

export type GenerationPermission = (typeof GenerationPermission)[keyof typeof GenerationPermission];

const READ_ONLY: readonly GenerationPermission[] = [GenerationPermission.ReadPromptTemplates];
const ALL_PERMISSIONS: readonly GenerationPermission[] = Object.values(GenerationPermission);

export const ROLE_GENERATION_PERMISSIONS: Record<string, readonly GenerationPermission[]> = {
  OWNER: ALL_PERMISSIONS,
  ORGANIZATION_ADMIN: ALL_PERMISSIONS,
  BID_MANAGER: READ_ONLY,
  CONTRIBUTOR: READ_ONLY,
  REVIEWER: READ_ONLY,
  EXECUTIVE: READ_ONLY,
  EXTERNAL_CONSULTANT: READ_ONLY,
  READ_ONLY: READ_ONLY,
};

export function roleHasGenerationPermission(role: string, permission: GenerationPermission): boolean {
  return (ROLE_GENERATION_PERMISSIONS[role] ?? []).includes(permission);
}
