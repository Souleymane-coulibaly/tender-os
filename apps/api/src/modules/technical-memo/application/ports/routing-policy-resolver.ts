export type ActiveRoutingModelSelector = Readonly<{ provider: string; modelKey: string }>;

/**
 * Consolidation IA — Checkpoint A (Foundation §3) — port propre à Mémoire technique, même motif
 * exact que `chat/application/ports/routing-policy-resolver.ts` (voir ce fichier pour la
 * justification complète de la duplication structurelle entre modules). `resolveActive` retourne
 * `null` tant qu'aucune `RoutingPolicy` ACTIVE n'existe pour le task type `TECHNICAL_MEMO_SECTION`
 * — `GenerateTechnicalMemoSectionUseCase` retombe alors sur son modèle statique historique
 * (`TechnicalMemoAiConfig.aiModel`), jamais une exception.
 */
export type ActiveRoutingDecision = Readonly<{
  policyId: string;
  policyVersion: number;
  primaryModel: ActiveRoutingModelSelector;
}>;

export interface RoutingPolicyResolver {
  resolveActive(input: { organizationId: string; promptKey: string }): Promise<ActiveRoutingDecision | null>;
}

export const ROUTING_POLICY_RESOLVER = Symbol("TECHNICAL_MEMO_ROUTING_POLICY_RESOLVER");
