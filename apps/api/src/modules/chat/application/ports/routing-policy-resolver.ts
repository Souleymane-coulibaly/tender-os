export type ActiveRoutingModelSelector = Readonly<{ provider: string; modelKey: string }>;

/**
 * Consolidation IA — Checkpoint A (Foundation §3) — port propre à Chat, structurellement identique
 * à `analysis/application/ports/routing-policy-resolver.ts` et `generation/application/ports/
 * routing-policy-resolver.ts`, jamais un import direct de l'un ou l'autre (même motif documenté :
 * "le port vit dans le module qui l'utilise, jamais dans le module qui l'implémente" — éviterait
 * une dépendance `chat → analysis`/`chat → generation` que rien ne justifie fonctionnellement).
 * `RoutingPolicyBridgeModule` (ai-benchmark) lie la MÊME `PrismaRoutingPolicyResolver` (zéro logique
 * spécifique à Chat) à ce token, en plus de ceux d'Analyse et Génération.
 *
 * `resolveActive` retourne `null` quand aucune politique n'est configurée pour le task type `CHAT`
 * (ou que le pont n'est pas câblé) — `SendMessageUseCase` retombe alors STRICTEMENT sur son
 * comportement historique (modèle statique `ChatConfig.aiModel`), jamais une exception : l'absence
 * de routing ne doit jamais faire échouer une conversation. Même motif de repli optionnel qu'Analyse
 * (jamais celui, obligatoire, de Génération — Chat a un comportement historique à préserver).
 */
export type ActiveRoutingDecision = Readonly<{
  policyId: string;
  policyVersion: number;
  primaryModel: ActiveRoutingModelSelector;
}>;

export interface RoutingPolicyResolver {
  resolveActive(input: { organizationId: string; promptKey: string }): Promise<ActiveRoutingDecision | null>;
}

export const ROUTING_POLICY_RESOLVER = Symbol("CHAT_ROUTING_POLICY_RESOLVER");
