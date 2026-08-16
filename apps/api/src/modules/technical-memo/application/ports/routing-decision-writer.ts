/**
 * Consolidation IA — Checkpoint D (traçabilité des décisions de routing, Mémoire technique) — même
 * motif que `analysis/application/ports/routing-decision-writer.ts` : le port vit ici, dans le
 * module qui l'utilise, jamais dans le module qui l'implémente (`ai-benchmark`). Structurellement
 * proche du port Analyse, jamais un import direct de ce dernier (créerait une dépendance
 * `technical-memo → analysis` que rien ne justifie fonctionnellement) — et volontairement calqué
 * sur son régime BEST-EFFORT (jamais celui, obligatoire, de Génération) : `routingPolicyId`/
 * `routingPolicyVersion`/`clientAccountId`/`tenderId` restent optionnels (chemin legacy possible,
 * jamais une valeur fabriquée), et l'absence de writer ou un échec d'écriture ne doit JAMAIS faire
 * échouer une génération de section déjà obtenue avec succès — voir
 * `generate-technical-memo-section.use-case.ts`.
 *
 * `create()` est appelée AVANT le premier appel provider ; `complete()` une seule fois à la toute
 * fin. Jamais de prompt/document complet ni de clé API dans ces champs — uniquement des métadonnées
 * d'exécution (modèles, tokens, latence, statut).
 */
export type CreateRoutingDecisionInput = Readonly<{
  id: string;
  organizationId: string;
  /** Best-effort (résolu via Tender.clientAccountId par l'implémentation) — `undefined` si non
   *  résolvable, ne doit jamais faire échouer la création de la décision elle-même. */
  clientAccountId?: string | undefined;
  tenderId?: string | undefined;
  technicalMemoSectionId: string;
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
  latencyMs?: number | undefined;
  status: "SUCCEEDED" | "FAILED";
  failureReason?: string | undefined;
  occurredAt: Date;
}>;

export interface RoutingDecisionWriter {
  create(input: CreateRoutingDecisionInput): Promise<void>;
  complete(input: CompleteRoutingDecisionInput): Promise<void>;
}

export const ROUTING_DECISION_WRITER = Symbol("TECHNICAL_MEMO_ROUTING_DECISION_WRITER");
