/**
 * Contrat que `generation` CONSOMME (correctif Sprint 6, audit Codex P1-2 — "Generation ne persiste
 * pas une vraie RoutingDecision") — même motif que `RoutingPolicyResolver` : le port vit ici, dans
 * le module qui l'utilise, jamais dans le module qui l'implémente (`ai-benchmark`). Structurellement
 * proche de `analysis/application/ports/routing-decision-writer.ts`, jamais un import direct de ce
 * dernier (créerait une dépendance `generation → analysis` que rien ne justifie fonctionnellement).
 *
 * Checkpoint TENDEROS-2.1-P2.3-E4 — `routingPolicyId`/`routingPolicyVersion` sont devenus
 * OPTIONNELS (initialement obligatoires, Sprint 6 : `create()` n'était appelée QUE lorsqu'une
 * RoutingPolicy active avait réellement été résolue, `NoActiveRoutingPolicyError` sinon). Ce
 * checkpoint remplace cet échec dur par un repli sur `AiModelRouter` (mission §9, NANO/MINI par
 * TaskType, AUTOMATIC sans configuration requise) quand aucune policy n'est active — `create()` est
 * désormais aussi appelée pour CE cas, avec `routingPolicyId`/`routingPolicyVersion` à `undefined`
 * (jamais une valeur fabriquée) : la colonne DB est déjà nullable (`routing_decisions.routing_
 * policy_id`), aucune migration nécessaire.
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
  routingPolicyId?: string | undefined;
  routingPolicyVersion?: number | undefined;
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
