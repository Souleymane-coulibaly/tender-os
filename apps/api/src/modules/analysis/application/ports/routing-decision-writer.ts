/**
 * Contrat que `analysis` CONSOMME (audit Codex P1-4 — "routing decision non durable") — même motif
 * que `RoutingPolicyResolver` : le port vit ici, dans le module qui l'utilise, jamais dans le
 * module qui l'implémente (`ai-benchmark`). Persistance DURABLE d'une décision de routage pour un
 * job d'analyse réel — distincte du journal d'audit best-effort (`AuditLogWriter`), qui reste
 * best-effort par conception et n'est jamais une source de vérité interrogeable.
 *
 * `create()` est appelée AVANT le premier appel provider (mission "la décision doit être créée
 * avant ou au début de l'appel") ; `complete()` une seule fois à la toute fin, qu'il y ait eu
 * escalade ou non. Jamais de prompt/document complet ni de clé API dans ces champs — uniquement
 * des métadonnées d'exécution (modèles, tokens, coût, latence, statut).
 */
export type CreateRoutingDecisionInput = Readonly<{
  id: string;
  organizationId: string;
  /** Best-effort (résolu via Tender.clientAccountId) — `undefined` si non résolvable, ne doit
   *  jamais faire échouer la création de la décision elle-même. */
  clientAccountId?: string | undefined;
  tenderId?: string | undefined;
  analysisId: string;
  promptKey: string;
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
  actualCostAmount?: string | undefined;
  currency?: string | undefined;
  latencyMs?: number | undefined;
  status: "SUCCEEDED" | "FAILED";
  failureReason?: string | undefined;
  occurredAt: Date;
}>;

export interface RoutingDecisionWriter {
  create(input: CreateRoutingDecisionInput): Promise<void>;
  complete(input: CompleteRoutingDecisionInput): Promise<void>;
}

export const ROUTING_DECISION_WRITER = Symbol("ROUTING_DECISION_WRITER");
