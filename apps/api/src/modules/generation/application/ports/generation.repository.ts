import type { Generation } from "../../domain/generation.aggregate";
import type { GenerationStatus } from "../../domain/generation-status";
import type { GenerationTaskType } from "../../domain/generation-task-type";

export type GenerationReservationOutcome =
  | { kind: "reserved"; generation: Generation }
  | { kind: "not_startable"; status: GenerationStatus };

export type FinalizeGenerationOutcome =
  | {
      kind: "generated";
      /** Correctif Sprint 6 (audit Codex P1-2) — résolus par `ProcessGenerationUseCase` avant
       *  l'appel provider, jamais à la réservation (Phase 1). */
      routingPolicyId?: string | undefined;
      routingPolicyVersion?: number | undefined;
      routingDecisionId?: string | undefined;
      modelProvider: string;
      modelKey: string;
      fallbackLevel: number;
      generatedContent?: string | undefined;
      structuredContent?: unknown;
      inputTokenCount?: number | undefined;
      outputTokenCount?: number | undefined;
      totalTokenCount?: number | undefined;
      estimatedCostAmount?: string | undefined;
      currency?: string | undefined;
      latencyMs: number;
    }
  | {
      kind: "failed";
      /** Renseignés uniquement si une RoutingDecision a réellement été créée avant l'échec. */
      routingPolicyId?: string | undefined;
      routingPolicyVersion?: number | undefined;
      routingDecisionId?: string | undefined;
      modelProvider?: string | undefined;
      modelKey?: string | undefined;
      errorCode: string;
      errorMessage: string;
    };

export type ListGenerationsByTenderQuery = Readonly<{
  organizationId: string;
  tenderId: string;
  taskType?: GenerationTaskType | undefined;
  limit: number;
  offset: number;
}>;

export type GenerationListResult = Readonly<{ items: readonly Generation[]; total: number }>;

export interface GenerationRepository {
  findById(input: { organizationId: string; generationId: string }): Promise<Generation | null>;
  /** Toutes les versions d'un même fil, triées par `version` croissant. */
  findByRoot(input: { organizationId: string; rootGenerationId: string }): Promise<readonly Generation[]>;
  /** Une ligne par fil (la dernière version de chaque `rootGenerationId`) — pour la liste par Tender. */
  listByTender(query: ListGenerationsByTenderQuery): Promise<GenerationListResult>;
  /** Garde-fou "double génération en vol" — cherche une ligne PENDING/GENERATING pour la même cible
   *  exacte (organisation, tender, taskType, targetRef). Première ligne de défense applicative ;
   *  l'index unique partiel `generations_org_tender_tasktype_target_inflight_key` (migration) reste
   *  le filet de sécurité de dernier recours contre une course de concurrence. */
  findInFlightForTarget(input: {
    organizationId: string;
    tenderId: string;
    taskType: GenerationTaskType;
    targetRef?: string | undefined;
  }): Promise<Generation | null>;
  create(generation: Generation): Promise<void>;
  save(generation: Generation): Promise<void>;
  /** Phase 1 — réservation atomique courte : PENDING → GENERATING. */
  reserveForGenerating(input: { organizationId: string; generationId: string; occurredAt: Date }): Promise<GenerationReservationOutcome>;
  /** Phase 3 — finalisation atomique courte, compare-and-set sur `expectedAttemptCount` (même
   *  motif que `AnalysisJobRepository.finalizeAttempt`). Contrairement à Analysis, aucun
   *  `onSuccessTx` n'est nécessaire : le contenu généré vit directement sur la ligne `Generation`,
   *  jamais dans une table de résultat séparée. */
  finalizeGeneration(input: {
    organizationId: string;
    generationId: string;
    expectedAttemptCount: number;
    occurredAt: Date;
    outcome: FinalizeGenerationOutcome;
  }): Promise<{ applied: boolean }>;

  /** Sprint 21 (hardening) — mission PARTIE F : simple lecture (jamais verrouillée) des candidats
   *  GENERATING dont `updatedAt` dépasse le seuil — cross-organisation, consommée uniquement par
   *  `ReclaimStaleGenerationsUseCase`, qui revérifie l'état via `findById` avant de muter. */
  findStaleGeneratingCandidates(input: { olderThan: Date; limit: number }): Promise<readonly { organizationId: string; generationId: string }[]>;

  /** Correctif (réaudit externe post-Sprint 21) — compare-and-set, même motif que
   *  `finalizeGeneration` : `ReclaimStaleGenerationsUseCase` lisait la génération puis la mutait via
   *  `save()` (écriture inconditionnelle par id seul) — si le worker réel finalisait la génération
   *  (GENERATED/FAILED) DANS LA FENÊTRE entre cette lecture et cette écriture, la reprise stale
   *  écrasait silencieusement un résultat déjà acquis en le repassant à PENDING. `attemptCount`
   *  DOIT correspondre à la valeur lue par l'appelant — sinon `applied: false` sans rien modifier,
   *  jamais un état plus récent silencieusement perdu. */
  reclaimStaleGenerating(input: { organizationId: string; generationId: string; expectedAttemptCount: number }): Promise<{ applied: boolean }>;
}

export const GENERATION_REPOSITORY = Symbol("GENERATION_REPOSITORY");
