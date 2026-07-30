import { ALLOWED_ANALYSIS_TRANSITIONS, AnalysisStatus } from "./analysis-status";
import type { AnalysisScope } from "./analysis-scope";
import { InvalidAnalysisStatusTransitionError } from "./errors";

export type AnalysisJobProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  /** Renseignés uniquement pour `AnalysisScope.Document` — jamais pour `AnalysisScope.Tender`. */
  dceId?: string | undefined;
  documentId?: string | undefined;
  /** Discriminant polymorphe de cible = `documentId` (scope DOCUMENT) ou `tenderId` (scope
   *  TENDER) — porté en base pour permettre une contrainte d'unicité et un index uniques sur une
   *  seule colonne, jamais des index partiels dépendant du scope (voir migration). */
  targetId: string;
  scope: AnalysisScope;
  status: AnalysisStatus;
  provider?: string | undefined;
  model?: string | undefined;
  /** Numéro de version de CETTE analyse pour sa cible — jamais réutilisé, jamais décrémenté
   *  (mission §"Deux analyses de versions différentes doivent pouvoir coexister"). */
  analysisVersion: number;
  promptVersion: number;
  /** `DocumentAnalysisInput.extractionVersion` au moment de la création (scope DOCUMENT
   *  uniquement) — capturé une fois, jamais recalculé après coup. */
  extractionVersion?: number | undefined;
  inputChecksum?: string | undefined;
  /** Rôle RÉEL de l'acteur ayant déclenché la réservation COURANTE (création initiale ou dernier
   *  retry) — mission Sprint 4.2 §"Phase 2 sans acteur HTTP vivant" : le traitement en arrière-plan
   *  (`ProcessAnalysisJobUseCase`) doit pouvoir légitimement appeler le contrat RBAC-gated
   *  `GetDocumentAnalysisInputUseCase` (Sprint 3) sans jamais fabriquer un rôle. Toujours renseigné
   *  à la création (voir `Start*AnalysisUseCase`) et mis à jour à chaque retry (voir
   *  `RetryAnalysisUseCase`) — jamais un rôle par défaut arbitraire. */
  triggeredByRole?: string | undefined;
  /** Jeton de réservation (mission "tentative obsolète") — incrémenté uniquement par `reserve()`,
   *  comparé lors de la finalisation (voir `AnalysisJobRepository.finalizeAttempt`). */
  attemptCount: number;
  startedAt?: Date | undefined;
  completedAt?: Date | undefined;
  durationMs?: number | undefined;
  inputTokenCount?: number | undefined;
  outputTokenCount?: number | undefined;
  totalTokenCount?: number | undefined;
  /** Sortie technique volontairement minimale (mission §"Sortie du provider pour le Sprint 4.1")
   *  — jamais une structure métier détaillée. */
  resultSummary?: string | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
};

export type AnalysisJobCompletionInput = {
  outcome: typeof AnalysisStatus.Succeeded | typeof AnalysisStatus.PartiallySucceeded;
  provider: string;
  model: string;
  durationMs: number;
  inputTokenCount?: number | undefined;
  outputTokenCount?: number | undefined;
  totalTokenCount?: number | undefined;
  resultSummary?: string | undefined;
};

export type AnalysisJobFailureInput = {
  provider?: string | undefined;
  model?: string | undefined;
  errorCode: string;
  errorMessage: string;
};

/**
 * Job d'analyse IA (mission Sprint 4.1) — même motif de cycle en 3 phases que
 * `DocumentExtraction` (module Extraction, correction P1-02) :
 * 1. `reserve()` — réservation atomique courte : QUEUED → PROCESSING, incrémente `attemptCount`.
 *    Aucune E/S (aucun appel provider) n'accompagne cette transition.
 * 2. L'appel au provider IA (port `AIProvider`) se déroule ENTIÈREMENT hors transaction, porté par
 *    `ProcessAnalysisJobUseCase` — jamais par cet agrégat.
 * 3. `complete()`/`fail()` — finalisation, appliquée par l'orchestrateur UNIQUEMENT si la
 *    réservation courante est encore valide (compare-and-set sur `attemptCount`, voir
 *    `AnalysisJobRepository.finalizeAttempt`).
 *
 * Ne contient JAMAIS le contenu du corpus analysé ni la réponse complète du provider — seules des
 * métadonnées techniques et un résumé technique minimal (mission §"Persistence Prisma").
 */
export class AnalysisJob {
  private constructor(private props: AnalysisJobProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    dceId?: string | undefined;
    documentId?: string | undefined;
    scope: AnalysisScope;
    analysisVersion: number;
    promptVersion: number;
    extractionVersion?: number | undefined;
    inputChecksum?: string | undefined;
    triggeredByRole?: string | undefined;
    occurredAt: Date;
  }): AnalysisJob {
    return new AnalysisJob({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      dceId: input.dceId,
      documentId: input.documentId,
      targetId: input.documentId ?? input.tenderId,
      scope: input.scope,
      status: AnalysisStatus.Pending,
      analysisVersion: input.analysisVersion,
      promptVersion: input.promptVersion,
      extractionVersion: input.extractionVersion,
      inputChecksum: input.inputChecksum,
      triggeredByRole: input.triggeredByRole,
      attemptCount: 0,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: AnalysisJobProps): AnalysisJob {
    return new AnalysisJob(props);
  }

  private transitionTo(next: AnalysisStatus, occurredAt: Date): void {
    const allowed = ALLOWED_ANALYSIS_TRANSITIONS[this.props.status];
    if (!allowed.includes(next)) {
      throw new InvalidAnalysisStatusTransitionError({ from: this.props.status, to: next });
    }
    this.props.status = next;
    this.props.updatedAt = occurredAt;
  }

  /** Accepté par le dispatcher — jamais persisté en `PENDING` (voir StartDocumentAnalysisUseCase /
   *  StartTenderAnalysisUseCase, qui appellent `queue()` avant la toute première écriture). */
  queue(occurredAt: Date): void {
    this.transitionTo(AnalysisStatus.Queued, occurredAt);
  }

  /** Phase 1 — réservation atomique courte : QUEUED → PROCESSING, incrémente `attemptCount` en
   *  une seule opération. */
  reserve(occurredAt: Date): void {
    this.transitionTo(AnalysisStatus.Processing, occurredAt);
    this.props.attemptCount += 1;
    this.props.startedAt = occurredAt;
  }

  /** Phase 3 (succès) — jamais appelée en dehors de `finalizeAttempt` (compare-and-set). */
  complete(input: AnalysisJobCompletionInput, occurredAt: Date): void {
    this.transitionTo(input.outcome, occurredAt);
    this.props.provider = input.provider;
    this.props.model = input.model;
    this.props.completedAt = occurredAt;
    this.props.durationMs = input.durationMs;
    this.props.inputTokenCount = input.inputTokenCount;
    this.props.outputTokenCount = input.outputTokenCount;
    this.props.totalTokenCount = input.totalTokenCount;
    this.props.resultSummary = input.resultSummary;
    this.props.errorCode = undefined;
    this.props.errorMessage = undefined;
  }

  fail(input: AnalysisJobFailureInput, occurredAt: Date): void {
    this.transitionTo(AnalysisStatus.Failed, occurredAt);
    if (input.provider) this.props.provider = input.provider;
    if (input.model) this.props.model = input.model;
    this.props.completedAt = occurredAt;
    this.props.errorCode = input.errorCode;
    this.props.errorMessage = input.errorMessage;
  }

  cancel(occurredAt: Date): void {
    this.transitionTo(AnalysisStatus.Cancelled, occurredAt);
  }

  /** Seule transition sortante de FAILED (mission §"reprise après erreur") — jamais automatique,
   *  toujours déclenchée par `RetryAnalysisUseCase`. Cible toujours QUEUED : la même version, le
   *  même job, un nouvel `attemptCount` à la prochaine réservation — jamais une nouvelle ligne
   *  (voir `StartDocumentAnalysisUseCase` pour la création d'une nouvelle version). */
  resetForRetry(input: { triggeredByRole: string }, occurredAt: Date): void {
    this.transitionTo(AnalysisStatus.Queued, occurredAt);
    this.props.errorCode = undefined;
    this.props.errorMessage = undefined;
    this.props.triggeredByRole = input.triggeredByRole;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get tenderId(): string {
    return this.props.tenderId;
  }
  get dceId(): string | undefined {
    return this.props.dceId;
  }
  get documentId(): string | undefined {
    return this.props.documentId;
  }
  get targetId(): string {
    return this.props.targetId;
  }
  get scope(): AnalysisScope {
    return this.props.scope;
  }
  get status(): AnalysisStatus {
    return this.props.status;
  }
  get provider(): string | undefined {
    return this.props.provider;
  }
  get model(): string | undefined {
    return this.props.model;
  }
  get analysisVersion(): number {
    return this.props.analysisVersion;
  }
  get promptVersion(): number {
    return this.props.promptVersion;
  }
  get extractionVersion(): number | undefined {
    return this.props.extractionVersion;
  }
  get inputChecksum(): string | undefined {
    return this.props.inputChecksum;
  }
  get triggeredByRole(): string | undefined {
    return this.props.triggeredByRole;
  }
  get attemptCount(): number {
    return this.props.attemptCount;
  }
  get startedAt(): Date | undefined {
    return this.props.startedAt;
  }
  get completedAt(): Date | undefined {
    return this.props.completedAt;
  }
  get durationMs(): number | undefined {
    return this.props.durationMs;
  }
  get inputTokenCount(): number | undefined {
    return this.props.inputTokenCount;
  }
  get outputTokenCount(): number | undefined {
    return this.props.outputTokenCount;
  }
  get totalTokenCount(): number | undefined {
    return this.props.totalTokenCount;
  }
  get resultSummary(): string | undefined {
    return this.props.resultSummary;
  }
  get errorCode(): string | undefined {
    return this.props.errorCode;
  }
  get errorMessage(): string | undefined {
    return this.props.errorMessage;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
