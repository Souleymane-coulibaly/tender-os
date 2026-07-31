import type { EscalationCondition } from "../../domain/escalation-condition";

/**
 * Contrat que `analysis` CONSOMME (Sprint 5.2 §"Intégration Analysis") — même motif que
 * `AIProviderRegistry`/`PromptTemplatePort` : le port vit ici, dans le module qui l'utilise, jamais
 * dans le module qui l'implémente (`ai-benchmark`). Aucune dépendance de `analysis` vers
 * `ai-benchmark` : c'est la racine de composition (`AppModule`) qui relie les deux via un module
 * `@Global()` (`ai-benchmark/infrastructure/routing-policy-bridge.module.ts`).
 *
 * `resolveActive` retourne `null` quand aucune politique n'est configurée (ou que le pont n'est pas
 * câblé) — `ProcessAnalysisJobUseCase` retombe alors STRICTEMENT sur son comportement Sprint
 * 4.1/4.2 (résolution par variable d'environnement), jamais une exception : l'absence de routing
 * ne doit jamais faire échouer une analyse.
 */
export type ActiveRoutingModelSelector = Readonly<{ provider: string; modelKey: string }>;

export type ActiveRoutingDecision = Readonly<{
  policyId: string;
  policyVersion: number;
  primaryModel: ActiveRoutingModelSelector;
  escalationModel?: ActiveRoutingModelSelector | undefined;
  confidenceThreshold?: number | undefined;
  provenanceRequired: boolean;
  escalationConditions: readonly EscalationCondition[];
  timeoutMs: number;
  maxRetries: number;
}>;

export interface RoutingPolicyResolver {
  resolveActive(input: { organizationId: string; promptKey: string }): Promise<ActiveRoutingDecision | null>;
}

export const ROUTING_POLICY_RESOLVER = Symbol("ROUTING_POLICY_RESOLVER");
