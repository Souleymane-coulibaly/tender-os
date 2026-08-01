/**
 * Contrat que `generation` CONSOMME (correctif Sprint 6, audit Codex P1-2 — "Generation ne persiste
 * pas une vraie RoutingDecision") — même motif que `RoutingPolicyResolver` : le port vit ici, dans
 * le module qui l'utilise, jamais dans le module qui l'implémente (`ai-benchmark`). Structurellement
 * proche de `analysis/application/ports/routing-decision-writer.ts`, jamais un import direct de ce
 * dernier (créerait une dépendance `generation → analysis` que rien ne justifie fonctionnellement) —
 * et volontairement distinct sur un point : ici `routingPolicyId`/`routingPolicyVersion` sont
 * OBLIGATOIRES, jamais optionnels, puisque `create()` n'est appelée QUE lorsqu'une RoutingPolicy
 * active a réellement été résolue (voir `NoActiveRoutingPolicyError` : la génération échoue
 * explicitement avant tout appel provider si ce n'est pas le cas — jamais de décision "creuse").
 *
 * `create()` est appelée AVANT le premier appel provider ; `complete()` une seule fois à la toute
 * fin, qu'il y ait eu fallback ou non. Jamais de prompt/document complet ni de clé API dans ces
 * champs — uniquement des métadonnées d'exécution (modèles, tokens, coût, latence, statut).
 */
export type CreateRoutingDecisionInput = Readonly<{
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  generationId: string;
  taskType: string;
  routingPolicyId: string;
  routingPolicyVersion: number;
  primaryProvider: string;
  primaryModel: string;
  occurredAt: Date;
}>;

export type CompleteRoutingDecisionInput = Readonly<{
  id: string;
  selectedProvider?: string | undefined;
  selectedModel?: string | undefined;
  fallbackLevel: number;
  fallbackAttempts: number;
  inputTokenCount?: number | undefined;
  outputTokenCount?: number | undefined;
  latencyMs?: number | undefined;
  status: "SUCCEEDED" | "FAILED";
  failureReason?: string | undefined;
  occurredAt: Date;
}>;

/** Coût RÉEL calculé par l'implémentation à partir des pricing snapshots Sprint 5.2 (correctif
 *  P2-3 — "coût calculé depuis une configuration statique") — jamais par Generation elle-même, qui
 *  ne doit posséder aucune configuration de tarifs pour cette valeur. `undefined` si aucun tarif
 *  courant n'est résolvable pour le modèle utilisé — jamais un coût inventé. */
export type CompleteRoutingDecisionResult = Readonly<{
  actualCostAmount?: string | undefined;
  currency?: string | undefined;
}>;

export interface RoutingDecisionWriter {
  create(input: CreateRoutingDecisionInput): Promise<void>;
  complete(input: CompleteRoutingDecisionInput): Promise<CompleteRoutingDecisionResult>;
}

export const GENERATION_ROUTING_DECISION_WRITER = Symbol("GENERATION_ROUTING_DECISION_WRITER");
