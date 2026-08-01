import type { EscalationCondition } from "../../../analysis";

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

/**
 * Port propre à Generation — structurellement identique à `analysis/application/ports/
 * routing-policy-resolver.ts`, jamais un import direct de ce dernier (créerait une dépendance
 * `generation → analysis` que rien ne justifie fonctionnellement). Même principe "le port vit dans
 * le module qui l'utilise" : `RoutingPolicyBridgeModule` (ai-benchmark) lie `PrismaRoutingPolicyResolver`
 * (qui n'a aucune logique spécifique à Analysis) à CE token en plus du token d'Analysis.
 *
 * Correctif Sprint 6 (audit Codex P1-1 — "routing dormant") : `ai-benchmark` accepte désormais un
 * `promptKey` Generation (`RoutingPolicy.promptKey` élargi à `string`, voir `ROUTABLE_TASK_KEYS`
 * dans `ai-benchmark/interfaces/http/schemas.ts`) — `resolveActive()` retourne une vraie décision
 * dès qu'une `RoutingPolicy` ACTIVE existe pour ce `taskType`, `null` sinon (aucune policy, policy
 * inactive, ou modèle référencé désactivé). L'ABSENCE de décision n'est plus un signal à ignorer :
 * voir `ProcessGenerationUseCase`, qui échoue explicitement (`NoActiveRoutingPolicyError`) plutôt
 * que de retomber sur un modèle codé en dur.
 */
export interface RoutingPolicyResolver {
  resolveActive(input: { organizationId: string; promptKey: string }): Promise<ActiveRoutingDecision | null>;
}

export const ROUTING_POLICY_RESOLVER = Symbol("GENERATION_ROUTING_POLICY_RESOLVER");
