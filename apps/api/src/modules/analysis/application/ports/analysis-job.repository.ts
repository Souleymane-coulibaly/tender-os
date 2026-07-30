import type { AnalysisScope } from "../../domain/analysis-scope";
import type { AnalysisStatus } from "../../domain/analysis-status";
import type { AnalysisJob } from "../../domain/analysis-job.aggregate";
import type { PrismaTx } from "./business-analysis.repository";

/**
 * Vue de lecture/écriture scopée à une transaction Postgres courte protégée par un verrou
 * consultatif sur `targetId` (même motif que `ExclusiveExtractionContext`, module Extraction) —
 * réservée à la création idempotente d'une nouvelle version (mission §"double déclenchement") :
 * jamais un appel provider ou une opération d'E/S longue sous ce verrou.
 */
export type ExclusiveTargetContext = {
  findActiveByTarget(input: {
    organizationId: string;
    scope: AnalysisScope;
    targetId: string;
  }): Promise<AnalysisJob | null>;
  /** Version suivante pour cette cible (mission §"Deux analyses de versions différentes doivent
   *  pouvoir coexister") — jamais recalculée hors de ce verrou, pour éviter une collision entre
   *  deux créations concurrentes. */
  getNextVersion(input: { organizationId: string; scope: AnalysisScope; targetId: string }): Promise<number>;
  create(job: AnalysisJob): Promise<void>;
};

export type ReservationOutcome =
  | { kind: "reserved"; job: AnalysisJob }
  | { kind: "not_startable"; status: AnalysisStatus };

/** Résultat de la Phase 2 (hors transaction), consommé par `finalizeAttempt` (Phase 3) — même
 *  motif que `FinalizeAttemptOutcome` (module Extraction). */
export type FinalizeAttemptOutcome =
  | {
      kind: "succeeded" | "partially_succeeded";
      provider: string;
      model: string;
      durationMs: number;
      inputTokenCount?: number | undefined;
      outputTokenCount?: number | undefined;
      totalTokenCount?: number | undefined;
      resultSummary?: string | undefined;
    }
  | {
      kind: "failed";
      provider?: string | undefined;
      model?: string | undefined;
      errorCode: string;
      errorMessage: string;
    };

export type ListAnalysesByTargetResult = Readonly<{ items: readonly AnalysisJob[]; total: number }>;

export interface AnalysisJobRepository {
  findById(input: { organizationId: string; jobId: string }): Promise<AnalysisJob | null>;
  save(job: AnalysisJob): Promise<void>;

  /** Historique complet des versions d'analyse d'une cible (mission §"GET .../analyses") — jamais
   *  filtré par statut : une version FAILED/CANCELLED reste visible dans l'historique, seule
   *  `getLatestSummary` (BusinessAnalysisRepository) ignore les versions non réussies pour résoudre
   *  "la dernière analyse consultable". Ordonné par `analysisVersion` décroissant (le plus récent
   *  d'abord), jamais un ordre dépendant de l'implémentation. */
  listByTarget(input: {
    organizationId: string;
    scope: AnalysisScope;
    targetId: string;
    limit: number;
    offset: number;
  }): Promise<ListAnalysesByTargetResult>;

  /** Réservation atomique COURTE (Phase 1) — QUEUED → PROCESSING, incrément de `attemptCount`.
   *  Retourne `not_startable` sans rien modifier si le statut n'est plus QUEUED au moment de
   *  l'acquisition du verrou — jamais une exception, un no-op explicite (même motif que
   *  `DocumentExtractionRepository.reserveForProcessing`). */
  reserveForProcessing(input: { organizationId: string; jobId: string; occurredAt: Date }): Promise<ReservationOutcome>;

  /**
   * Finalisation atomique COURTE (Phase 3), compare-and-set sur `expectedAttemptCount` — une
   * tentative obsolète n'écrase jamais un résultat plus récent (`applied: false` sans écriture, ni
   * sur le job ni sur l'historique).
   *
   * Correction audit Codex Sprint 4.1 (P1-02) — persiste l'état terminal du job ET la ligne
   * `AnalysisAttempt` correspondante DANS LA MÊME transaction courte : un job ne peut plus jamais
   * atteindre un statut terminal sans que sa tentative d'historique soit également écrite (et
   * inversement, un échec d'écriture de l'historique fait échouer/annuler toute la finalisation,
   * jamais un état terminal silencieusement dépourvu d'historique).
   */
  finalizeAttempt(input: {
    organizationId: string;
    jobId: string;
    expectedAttemptCount: number;
    /** Début de CETTE réservation (juste après `reserveForProcessing`) — sert à calculer
     *  `durationMs`/`startedAt` de la ligne `AnalysisAttempt` créée atomiquement. */
    startedAt: Date;
    /** Fin de la réservation — sert à la fois de `updatedAt`/`completedAt` du job et de
     *  `finishedAt` de la tentative. */
    occurredAt: Date;
    outcome: FinalizeAttemptOutcome;
    /** MANUAL | RETRY | SYSTEM (voir `AnalysisTrigger`) — reporté tel quel sur `AnalysisAttempt`. */
    trigger: string;
    /** Nombre d'appels provider internes à cette réservation (voir `AnalysisAttempt.retryCount`). */
    retryCount: number;
    /**
     * Mission Sprint 4.2 §"Persistance atomique du résultat métier" — invoquée DANS LA MÊME
     * transaction courte que la mise à jour du job et l'écriture de `AnalysisAttempt`, UNIQUEMENT
     * si le compare-and-set réussit (jamais si `applied: false`, jamais hors transaction). Permet à
     * `BusinessAnalysisRepository.persistDocumentAnalysis`/`persistTenderConsolidation` d'écrire le
     * résultat métier structuré sans jamais laisser un job atteindre un état terminal SUCCEEDED sans
     * son résultat métier correspondant (même garantie que P1-02 pour `AnalysisAttempt`). Si elle
     * lève, toute la transaction est annulée : le job reste PROCESSING, récupérable par retry.
     */
    onSuccessTx?: ((tx: PrismaTx) => Promise<void>) | undefined;
  }): Promise<{ applied: boolean }>;

  /** Verrou court scopé à la CIBLE (documentId ou tenderId) — réservé à la création idempotente
   *  d'une nouvelle version (StartDocumentAnalysisUseCase / StartTenderAnalysisUseCase). */
  runExclusiveForTarget<T>(input: {
    organizationId: string;
    scope: AnalysisScope;
    targetId: string;
    fn: (context: ExclusiveTargetContext) => Promise<T>;
  }): Promise<T>;

  /** Verrou court scopé au JOB — réservé aux opérations qui ne sont PAS le traitement lui-même :
   *  retour FAILED→QUEUED (Retry), annulation (Cancel). Jamais utilisé pour tenir un appel
   *  provider (voir `reserveForProcessing`/`finalizeAttempt`). Charge le job sous verrou (lève
   *  `AnalysisNotFoundError` si absent ou hors organisation), appelle `fn` qui le mute en place,
   *  puis persiste le résultat dans la même transaction avant de retourner. */
  runExclusiveForJob<T>(input: { organizationId: string; jobId: string; fn: (job: AnalysisJob) => Promise<T> }): Promise<T>;
}

export const ANALYSIS_JOB_REPOSITORY = Symbol("ANALYSIS_JOB_REPOSITORY");
