import { ALLOWED_GENERATION_TRANSITIONS, GenerationStatus } from "./generation-status";
import type { GenerationTaskType } from "./generation-task-type";
import {
  GenerationAlreadyRejectedError,
  GenerationAlreadyValidatedError,
  GenerationNotCancellableError,
  GenerationNotEditableError,
  GenerationNotRejectableError,
  GenerationNotRetryableError,
  GenerationNotValidatableError,
  InvalidGenerationStatusTransitionError,
} from "./errors";

export type GenerationProps = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  taskType: GenerationTaskType;
  targetRef?: string | undefined;
  /** undefined = cette ligne EST la version 1 (racine) de son fil. */
  parentGenerationId?: string | undefined;
  /** = id si version 1, = parentGenerationId sinon (voir aggregate/schema pour la justification). */
  rootGenerationId: string;
  version: number;
  status: GenerationStatus;
  attemptCount: number;
  promptTemplateId: string;
  promptVersionId: string;
  promptVersionNumber: number;
  /** Correctif Sprint 6 (audit Codex P1-2) — résolus par `ProcessGenerationUseCase`, jamais à la
   *  création (`Generation.create()` a lieu avant toute résolution de routing) : `undefined` tant
   *  que le traitement n'a pas encore atteint la résolution de policy ; restent `undefined` pour
   *  toujours si la génération a échoué AVANT qu'une policy active ait pu être trouvée (voir
   *  `NoActiveRoutingPolicyError` — jamais de valeur fabriquée). */
  routingPolicyId?: string | undefined;
  routingPolicyVersion?: number | undefined;
  /** VRAIE FK vers une `RoutingDecision` Sprint 5.2 (plus un UUID local fabriqué) — `undefined`
   *  jusqu'à ce qu'une décision ait été réellement créée par `ProcessGenerationUseCase`. */
  routingDecisionId?: string | undefined;
  modelProvider?: string | undefined;
  modelKey?: string | undefined;
  fallbackLevel: number;
  generatedContent?: string | undefined;
  structuredContent?: unknown;
  editedContent?: string | undefined;
  editedStructuredContent?: unknown;
  editedBy?: string | undefined;
  editedAt?: Date | undefined;
  inputTokenCount?: number | undefined;
  outputTokenCount?: number | undefined;
  totalTokenCount?: number | undefined;
  estimatedCostAmount?: string | undefined;
  currency?: string | undefined;
  latencyMs?: number | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  createdBy: string;
  /** Rôle réel de l'acteur au moment du lancement — voir schema.prisma pour la justification
   *  complète (même motif qu'AnalysisJob.triggeredByRole). */
  createdByRole?: string | undefined;
  createdAt: Date;
  completedAt?: Date | undefined;
  validatedBy?: string | undefined;
  validatedAt?: Date | undefined;
  /** Correctif Sprint 6 (réaudit Codex P1 — "le rejet d'une génération est absent"). Un FAIT porté
   *  par ses propres colonnes sur la même ligne terminale GENERATED — même motif que `validatedBy`/
   *  `validatedAt` : jamais une transition qui rouvrirait la ligne ni ne réécrirait
   *  `generatedContent`/`structuredContent`/`editedContent`. Mutuellement exclusif avec
   *  `validatedAt` (voir `reject()`/`validate()`) : une génération est soit validée, soit rejetée,
   *  jamais les deux. */
  rejectedBy?: string | undefined;
  rejectedAt?: Date | undefined;
  rejectionReason?: string | undefined;
};

export type GenerationSuccessInput = {
  /** Correctif Sprint 6 (audit Codex P1-2) — résolus au moment du traitement, jamais à la création. */
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
};

export type GenerationFailureInput = {
  /** Renseignés uniquement si une RoutingPolicy active a été trouvée et une RoutingDecision créée
   *  AVANT l'échec (ex. l'appel provider a échoué après résolution) — `undefined` si l'échec
   *  survient avant toute résolution (ex. `NoActiveRoutingPolicyError`). */
  routingPolicyId?: string | undefined;
  routingPolicyVersion?: number | undefined;
  routingDecisionId?: string | undefined;
  modelProvider?: string | undefined;
  modelKey?: string | undefined;
  errorCode: string;
  errorMessage: string;
};

/**
 * Une ligne PAR VERSION (mission Sprint 6 §"Versionnement des générations" — "ne remplace jamais
 * silencieusement une ancienne génération"). Même motif en 3 phases qu'`AnalysisJob` :
 * 1. `reserve()` — réservation atomique courte : PENDING → GENERATING, incrémente `attemptCount`.
 *    Aucune E/S (aucun appel provider) n'accompagne cette transition.
 * 2. L'appel au provider IA se déroule ENTIÈREMENT hors transaction, porté par
 *    `ProcessGenerationUseCase` — jamais par cet agrégat.
 * 3. `markGenerated()`/`markFailed()` — finalisation, appliquée par l'orchestrateur UNIQUEMENT si la
 *    réservation courante est encore valide (compare-and-set sur `attemptCount`, voir
 *    `GenerationRepository.finalizeGeneration`).
 *
 * "Édité" et "validé" sont des faits (`applyEdit`/`validate`) portés par des colonnes sur la même
 * ligne terminale GENERATED — jamais une transition qui rouvrirait la ligne.
 */
export class Generation {
  private constructor(private props: GenerationProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    clientAccountId: string;
    tenderId: string;
    taskType: GenerationTaskType;
    targetRef?: string | undefined;
    parentGenerationId?: string | undefined;
    rootGenerationId: string;
    version: number;
    promptTemplateId: string;
    promptVersionId: string;
    promptVersionNumber: number;
    createdBy: string;
    createdByRole?: string | undefined;
    occurredAt: Date;
  }): Generation {
    return new Generation({
      id: input.id,
      organizationId: input.organizationId,
      clientAccountId: input.clientAccountId,
      tenderId: input.tenderId,
      taskType: input.taskType,
      targetRef: input.targetRef,
      parentGenerationId: input.parentGenerationId,
      rootGenerationId: input.rootGenerationId,
      version: input.version,
      status: GenerationStatus.Pending,
      attemptCount: 0,
      promptTemplateId: input.promptTemplateId,
      promptVersionId: input.promptVersionId,
      promptVersionNumber: input.promptVersionNumber,
      fallbackLevel: 0,
      createdBy: input.createdBy,
      createdByRole: input.createdByRole,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: GenerationProps): Generation {
    return new Generation(props);
  }

  private transitionTo(next: GenerationStatus): void {
    const allowed = ALLOWED_GENERATION_TRANSITIONS[this.props.status];
    if (!allowed.includes(next)) {
      throw new InvalidGenerationStatusTransitionError({ from: this.props.status, to: next });
    }
    this.props.status = next;
  }

  /** Phase 1 — réservation atomique courte : PENDING → GENERATING, incrémente `attemptCount`. */
  reserve(): void {
    this.transitionTo(GenerationStatus.Generating);
    this.props.attemptCount += 1;
  }

  /** Phase 3 (succès) — jamais appelée en dehors de `finalizeGeneration` (compare-and-set). */
  markGenerated(input: GenerationSuccessInput, occurredAt: Date): void {
    this.transitionTo(GenerationStatus.Generated);
    this.props.routingPolicyId = input.routingPolicyId;
    this.props.routingPolicyVersion = input.routingPolicyVersion;
    this.props.routingDecisionId = input.routingDecisionId;
    this.props.modelProvider = input.modelProvider;
    this.props.modelKey = input.modelKey;
    this.props.fallbackLevel = input.fallbackLevel;
    this.props.generatedContent = input.generatedContent;
    this.props.structuredContent = input.structuredContent;
    this.props.inputTokenCount = input.inputTokenCount;
    this.props.outputTokenCount = input.outputTokenCount;
    this.props.totalTokenCount = input.totalTokenCount;
    this.props.estimatedCostAmount = input.estimatedCostAmount;
    this.props.currency = input.currency;
    this.props.latencyMs = input.latencyMs;
    this.props.completedAt = occurredAt;
    this.props.errorCode = undefined;
    this.props.errorMessage = undefined;
  }

  markFailed(input: GenerationFailureInput, occurredAt: Date): void {
    this.transitionTo(GenerationStatus.Failed);
    if (input.routingPolicyId) this.props.routingPolicyId = input.routingPolicyId;
    if (input.routingPolicyVersion !== undefined) this.props.routingPolicyVersion = input.routingPolicyVersion;
    if (input.routingDecisionId) this.props.routingDecisionId = input.routingDecisionId;
    if (input.modelProvider) this.props.modelProvider = input.modelProvider;
    if (input.modelKey) this.props.modelKey = input.modelKey;
    this.props.completedAt = occurredAt;
    this.props.errorCode = input.errorCode;
    this.props.errorMessage = input.errorMessage;
  }

  cancel(occurredAt: Date): void {
    if (this.props.status !== GenerationStatus.Pending && this.props.status !== GenerationStatus.Generating) {
      throw new GenerationNotCancellableError();
    }
    this.transitionTo(GenerationStatus.Cancelled);
    this.props.completedAt = occurredAt;
  }

  /** Sprint 21 (hardening) — mission PARTIE F : reprise d'une génération restée GENERATING au-delà
   *  d'un seuil, déclenchée automatiquement par `ReclaimStaleGenerationsUseCase`, jamais par un
   *  acteur HTTP. `attemptCount` n'est PAS réinitialisé — la tentative interrompue reste comptée. */
  reclaimStale(): void {
    this.transitionTo(GenerationStatus.Pending);
  }

  /** Seule transition sortante de FAILED — jamais automatique, toujours déclenchée par
   *  `RetryGenerationUseCase`. Même ligne, même version, un nouvel `attemptCount` à la prochaine
   *  réservation — jamais une nouvelle ligne (voir `RegenerateGenerationUseCase` pour la création
   *  d'une nouvelle version, un cas distinct). */
  resetForRetry(): void {
    if (this.props.status !== GenerationStatus.Failed) {
      throw new GenerationNotRetryableError({ status: this.props.status });
    }
    this.transitionTo(GenerationStatus.Pending);
    this.props.errorCode = undefined;
    this.props.errorMessage = undefined;
  }

  /** Contenu édité par un humain, distinct du contenu généré — jamais un mélange silencieux
   *  (mission §"Édition humaine"). Uniquement sur une ligne GENERATED. */
  applyEdit(input: { editedBy: string; editedContent?: string | undefined; editedStructuredContent?: unknown }, occurredAt: Date): void {
    if (this.props.status !== GenerationStatus.Generated) {
      throw new GenerationNotEditableError();
    }
    this.props.editedContent = input.editedContent;
    this.props.editedStructuredContent = input.editedStructuredContent;
    this.props.editedBy = input.editedBy;
    this.props.editedAt = occurredAt;
  }

  /** Traçable (mission §"Validation") — uniquement sur une ligne GENERATED, jamais réouverte
   *  ensuite (pas de transition RESET-VALIDATION dans cette tranche). Correctif Sprint 6 (réaudit
   *  Codex P1) : jamais sur une génération déjà REJETÉE — les deux faits sont mutuellement
   *  exclusifs, un rejet explicite ne doit jamais être contourné par une validation ultérieure. */
  validate(input: { validatedBy: string }, occurredAt: Date): void {
    if (this.props.status !== GenerationStatus.Generated) {
      throw new GenerationNotValidatableError();
    }
    if (this.props.rejectedAt) {
      throw new GenerationAlreadyRejectedError();
    }
    this.props.validatedBy = input.validatedBy;
    this.props.validatedAt = occurredAt;
  }

  /** Correctif Sprint 6 (réaudit Codex P1 — "le rejet d'une génération est absent") — même motif
   *  que `validate()` : un FAIT porté par ses propres colonnes sur la ligne terminale GENERATED,
   *  jamais une transition qui rouvrirait la ligne, jamais une réécriture rétroactive de
   *  `generatedContent`/`structuredContent`/`editedContent`/`editedStructuredContent` (aucune de
   *  ces propriétés n'est touchée ici) ni des versions précédentes (chaque version est sa PROPRE
   *  ligne, `reject()` n'agit que sur CELLE explicitement ciblée). Interdit sur toute génération
   *  déjà VALIDÉE — les deux faits sont mutuellement exclusifs. */
  reject(input: { rejectedBy: string; reason?: string | undefined }, occurredAt: Date): void {
    if (this.props.status !== GenerationStatus.Generated) {
      throw new GenerationNotRejectableError();
    }
    if (this.props.validatedAt) {
      throw new GenerationAlreadyValidatedError();
    }
    this.props.rejectedBy = input.rejectedBy;
    this.props.rejectionReason = input.reason;
    this.props.rejectedAt = occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get clientAccountId(): string {
    return this.props.clientAccountId;
  }
  get tenderId(): string {
    return this.props.tenderId;
  }
  get taskType(): GenerationTaskType {
    return this.props.taskType;
  }
  get targetRef(): string | undefined {
    return this.props.targetRef;
  }
  get parentGenerationId(): string | undefined {
    return this.props.parentGenerationId;
  }
  get rootGenerationId(): string {
    return this.props.rootGenerationId;
  }
  get version(): number {
    return this.props.version;
  }
  get status(): GenerationStatus {
    return this.props.status;
  }
  get attemptCount(): number {
    return this.props.attemptCount;
  }
  get promptTemplateId(): string {
    return this.props.promptTemplateId;
  }
  get promptVersionId(): string {
    return this.props.promptVersionId;
  }
  get promptVersionNumber(): number {
    return this.props.promptVersionNumber;
  }
  get routingPolicyId(): string | undefined {
    return this.props.routingPolicyId;
  }
  get routingPolicyVersion(): number | undefined {
    return this.props.routingPolicyVersion;
  }
  get routingDecisionId(): string | undefined {
    return this.props.routingDecisionId;
  }
  get modelProvider(): string | undefined {
    return this.props.modelProvider;
  }
  get modelKey(): string | undefined {
    return this.props.modelKey;
  }
  get fallbackLevel(): number {
    return this.props.fallbackLevel;
  }
  get generatedContent(): string | undefined {
    return this.props.generatedContent;
  }
  get structuredContent(): unknown {
    return this.props.structuredContent;
  }
  get editedContent(): string | undefined {
    return this.props.editedContent;
  }
  get editedStructuredContent(): unknown {
    return this.props.editedStructuredContent;
  }
  get editedBy(): string | undefined {
    return this.props.editedBy;
  }
  get editedAt(): Date | undefined {
    return this.props.editedAt;
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
  get estimatedCostAmount(): string | undefined {
    return this.props.estimatedCostAmount;
  }
  get currency(): string | undefined {
    return this.props.currency;
  }
  get latencyMs(): number | undefined {
    return this.props.latencyMs;
  }
  get errorCode(): string | undefined {
    return this.props.errorCode;
  }
  get errorMessage(): string | undefined {
    return this.props.errorMessage;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdByRole(): string | undefined {
    return this.props.createdByRole;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get completedAt(): Date | undefined {
    return this.props.completedAt;
  }
  get validatedBy(): string | undefined {
    return this.props.validatedBy;
  }
  get validatedAt(): Date | undefined {
    return this.props.validatedAt;
  }
  get rejectedBy(): string | undefined {
    return this.props.rejectedBy;
  }
  get rejectedAt(): Date | undefined {
    return this.props.rejectedAt;
  }
  get rejectionReason(): string | undefined {
    return this.props.rejectionReason;
  }
}
