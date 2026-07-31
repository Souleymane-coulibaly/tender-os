import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import type { AnalysisJob } from "../../domain/analysis-job.aggregate";
import { AnalysisTrigger } from "../../domain/analysis-trigger";
import { AiTimeoutError } from "../../domain/errors";
import { evaluateEscalationConditions, type EscalationSignals } from "../../domain/evaluate-escalation-conditions";
import { isRetryableAiError } from "../policies/ai-error-classification";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { AI_PROVIDER_REGISTRY, type AIProviderRegistry } from "../ports/ai-provider-registry";
import type { AIProvider, AIProviderRequest, AIProviderResult } from "../ports/ai-provider";
import {
  ANALYSIS_CONTENT_RESOLVER,
  type AnalysisContentResolver,
} from "../ports/analysis-content-resolver";
import {
  ANALYSIS_JOB_REPOSITORY,
  type AnalysisJobRepository,
  type FinalizeAttemptOutcome,
} from "../ports/analysis-job.repository";
import { ROUTING_POLICY_RESOLVER, type RoutingPolicyResolver } from "../ports/routing-policy-resolver";
import { ROUTING_DECISION_WRITER, type RoutingDecisionWriter } from "../ports/routing-decision-writer";
import type { PrismaTx } from "../ports/business-analysis.repository";
import { ANALYSIS_CONFIG, type AnalysisConfig } from "../../infrastructure/analysis-config";
import { mapScopeToPromptKey, resolveModelForAnalysis, type ResolvedModelForAnalysis } from "../services/model-routing-resolver";

export type ProcessAnalysisJobCommand = Readonly<{
  organizationId: string;
  jobId: string;
  requestId?: string | undefined;
}>;

type Phase2Result =
  | {
      outcome: FinalizeAttemptOutcome & { kind: "succeeded" | "partially_succeeded" };
      retryCount: number;
      onSuccessTx?: ((tx: PrismaTx) => Promise<void>) | undefined;
    }
  | { outcome: FinalizeAttemptOutcome & { kind: "failed" }; retryCount: number; onSuccessTx?: undefined };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Orchestrateur du traitement d'un job d'analyse (mission Sprint 4.1) — même motif en 3 phases que
 * `ProcessDocumentExtractionUseCase` (module Extraction, correction P1-02) : jamais un appel
 * provider dans une transaction Prisma, jamais une attente réseau sous verrou DB.
 *
 * 1. `reserveForProcessing` — réservation atomique COURTE.
 * 2. `runPhase2` — appel provider HORS transaction, avec timeout et retry internes bornés
 *    (mission §"Timeout et retry" — les retries automatiques ne dupliquent jamais l'analyse : ils
 *    restent internes à CETTE réservation, jamais une nouvelle ligne `AnalysisJob`).
 * 3. `finalizeAttempt` — finalisation atomique COURTE, compare-and-set sur `attemptCount` — persiste
 *    DANS LA MÊME transaction l'état terminal du job ET la ligne `AnalysisAttempt` correspondante
 *    (correction audit Codex Sprint 4.1 P1-02 : un job ne peut plus atteindre un état terminal sans
 *    que son historique soit également écrit ; un échec d'écriture fait échouer toute la
 *    finalisation, le job restant PROCESSING plutôt que terminal sans historique).
 */
@Injectable()
export class ProcessAnalysisJobUseCase {
  private readonly logger = new Logger(ProcessAnalysisJobUseCase.name);

  constructor(
    @Inject(ANALYSIS_JOB_REPOSITORY) private readonly jobRepository: AnalysisJobRepository,
    @Inject(AI_PROVIDER_REGISTRY) private readonly providerRegistry: AIProviderRegistry,
    @Inject(ANALYSIS_CONTENT_RESOLVER) private readonly contentResolver: AnalysisContentResolver,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(ANALYSIS_CONFIG) private readonly config: AnalysisConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    // Optionnel (Sprint 5.2 §"Intégration Analysis") — si aucun pont ai-benchmark n'est câblé
    // (`RoutingPolicyResolver` absent), l'injection résout `undefined` et ce use case se comporte
    // EXACTEMENT comme en Sprint 4.1/4.2 (résolution du modèle par variable d'environnement) :
    // l'absence de routing ne doit jamais faire échouer une analyse.
    @Optional() @Inject(ROUTING_POLICY_RESOLVER) private readonly routingPolicyResolver?: RoutingPolicyResolver,
    // Optionnel (audit Codex P1-4) — même discipline : absent, la décision n'est simplement pas
    // persistée durablement (seul le meilleur-effort de `recordAuditLog` subsiste), jamais une
    // cause d'échec de l'analyse elle-même.
    @Optional() @Inject(ROUTING_DECISION_WRITER) private readonly routingDecisionWriter?: RoutingDecisionWriter,
  ) {}

  async execute(command: ProcessAnalysisJobCommand): Promise<void> {
    const reservedAt = this.clock.now();
    const reservation = await this.jobRepository.reserveForProcessing({
      organizationId: command.organizationId,
      jobId: command.jobId,
      occurredAt: reservedAt,
    });

    if (reservation.kind === "not_startable") {
      this.logger.warn(`Skipping analysis job ${command.jobId}: status is ${reservation.status}, not startable.`);
      return;
    }

    const { job } = reservation;
    const startedAt = reservedAt;
    const trigger = job.attemptCount === 1 ? AnalysisTrigger.Manual : AnalysisTrigger.Retry;

    const resolution = await resolveModelForAnalysis({
      scope: job.scope,
      organizationId: command.organizationId,
      config: this.config,
      routingPolicyResolver: this.routingPolicyResolver,
      onRoutingResolutionError: (error) =>
        this.logger.warn(
          `Routing policy resolution failed for job ${command.jobId}, falling back to the static model configuration: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        ),
    });

    // Audit Codex P1-4 — la décision est créée AVANT le premier appel provider (mission "la
    // décision doit être créée avant ou au début de l'appel"), pour rester lisible même si le
    // process crashe pendant l'appel. Best-effort : jamais une cause d'échec de l'analyse, mais
    // jamais silencieuse non plus (voir `createRoutingDecision`).
    const routingDecisionId = this.idGenerator.generate();
    await this.createRoutingDecision({ id: routingDecisionId, command, job, resolution });

    let { outcome, retryCount, onSuccessTx } = await this.runPhase2(job, resolution);
    let escalated = false;
    let escalationReason: string | undefined;

    // Escalade (Sprint 5.2 §"Fallback simple") — UNE seule tentative supplémentaire avec le modèle
    // d'escalade de la policy, uniquement si la tentative principale a échoué pour une raison
    // couverte par les conditions configurées. Jamais de boucle : au plus un second appel provider
    // par job, jamais un second appel si celui-ci est lui-même déjà une escalade.
    if (outcome.kind === "failed" && resolution.escalationModel) {
      const reason = evaluateEscalationConditions(this.toEscalationSignals(outcome.errorCode), resolution.escalationConditions);
      if (reason) {
        this.logger.warn(`Analysis job ${command.jobId} escalating to fallback model after "${reason}".`);
        const escalationResult = await this.runPhase2(job, {
          provider: resolution.escalationModel.provider,
          model: resolution.escalationModel.modelKey,
        });
        outcome = escalationResult.outcome;
        retryCount = retryCount + escalationResult.retryCount;
        onSuccessTx = escalationResult.onSuccessTx;
        escalated = true;
        escalationReason = reason;
      }
    }

    await this.completeRoutingDecision({ id: routingDecisionId, outcome, escalated });

    let finalizeResult: { applied: boolean };
    try {
      finalizeResult = await this.jobRepository.finalizeAttempt({
        organizationId: command.organizationId,
        jobId: command.jobId,
        expectedAttemptCount: job.attemptCount,
        startedAt,
        occurredAt: this.clock.now(),
        outcome,
        trigger,
        retryCount,
        onSuccessTx,
      });
    } catch (error) {
      // Correction P1-02 — l'écriture atomique (job + AnalysisAttempt) a échoué : le job n'a été
      // muté nulle part (transaction annulée), il reste PROCESSING, récupérable par un retry
      // manuel — jamais un état terminal silencieusement dépourvu d'historique.
      this.logger.error(
        `Atomic finalization (job + attempt) failed for analysis job ${command.jobId}, job left PROCESSING: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    if (!finalizeResult.applied) {
      this.logger.warn(
        `Finalization for analysis job ${command.jobId} discarded: the reservation (attempt ` +
          `${job.attemptCount}) is no longer current — a more recent attempt has since started.`,
      );
      return;
    }

    await this.recordAuditLog(command, outcome, {
      routingPolicyVersion: resolution.routingPolicyVersion,
      escalated,
      escalationReason,
    });
  }

  /** Intégralement hors transaction Prisma (mission §"Pas de transaction longue") — résolution du
   *  provider et du contenu métier réel (`AnalysisContentResolver`, mission Sprint 4.2), appel
   *  réseau avec timeout et retry bornés, validation stricte du schéma de sortie. Ne touche jamais
   *  la base : `onSuccessTx` n'est qu'une fonction préparée, invoquée plus tard par
   *  `finalizeAttempt`. Appelée une seconde fois pour l'escalade (Sprint 5.2) avec un sélecteur de
   *  modèle différent — `selector.provider` n'est fourni que lorsqu'une RoutingPolicy est active ;
   *  `undefined` retombe sur `AIProviderRegistry.resolve()` sans argument (comportement Sprint
   *  4.1/4.2 inchangé). */
  private async runPhase2(job: AnalysisJob, selector: { provider?: string | undefined; model: string }): Promise<Phase2Result> {
    const model = selector.model;
    let provider: AIProvider;
    try {
      provider = this.providerRegistry.resolve(selector.provider ? { provider: selector.provider } : undefined);
    } catch (error) {
      return { outcome: this.toFailureOutcome(error), retryCount: 0 };
    }

    let prepared: Awaited<ReturnType<AnalysisContentResolver["prepare"]>>;
    try {
      prepared = await this.contentResolver.prepare(job);
    } catch (error) {
      return { outcome: this.toFailureOutcome(error, provider.name, model), retryCount: 0 };
    }

    const maxAttempts = 1 + this.config.aiMaxRetries;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.callWithTimeout(provider, {
          model,
          systemPrompt: prepared.systemPrompt,
          userPrompt: prepared.userPrompt,
          responseSchemaName: prepared.responseSchemaName,
          timeoutMs: this.config.aiTimeoutMs,
        });
        // La validation stricte (Zod) se produit ici, hors transaction (mission §"Sorties
        // structurées") — une réponse invalide échoue immédiatement, jamais un retry ciblé
        // automatique au-delà des retries réseau déjà en cours.
        const success = await this.contentResolver.handleSuccess(job, result.content);
        return {
          outcome: {
            kind: "succeeded",
            provider: provider.name,
            model,
            durationMs: result.durationMs,
            inputTokenCount: result.usage.inputTokens,
            outputTokenCount: result.usage.outputTokens,
            totalTokenCount: result.usage.totalTokens,
            resultSummary: success.resultSummary,
          },
          retryCount: attempt - 1,
          onSuccessTx: success.persist,
        };
      } catch (error) {
        const isLastAttempt = attempt === maxAttempts;
        if (!isRetryableAiError(error) || isLastAttempt) {
          return { outcome: this.toFailureOutcome(error, provider.name, model), retryCount: attempt - 1 };
        }
        this.logger.warn(
          `AI provider call failed (retryable), attempt ${attempt}/${maxAttempts}: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
        await sleep(this.config.aiRetryDelayMs * attempt);
      }
    }

    // Inatteignable (maxAttempts >= 1 garantit une sortie dans la boucle) — TypeScript exhaustif.
    return { outcome: this.toFailureOutcome(new AiTimeoutError({ timeoutMs: this.config.aiTimeoutMs })), retryCount: maxAttempts - 1 };
  }

  private async callWithTimeout(provider: AIProvider, request: AIProviderRequest): Promise<AIProviderResult> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new AiTimeoutError({ timeoutMs: request.timeoutMs })), request.timeoutMs);
    });
    try {
      return await Promise.race([provider.complete(request), timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }

  private toFailureOutcome(
    error: unknown,
    provider?: string | undefined,
    model?: string | undefined,
  ): FinalizeAttemptOutcome & { kind: "failed" } {
    const code = this.errorCode(error);
    const reason = error instanceof Error ? error.message : String(error);
    this.logger.error(`Analysis job processing failed (${code}): ${reason}`);
    return { kind: "failed", provider, model, errorCode: code, errorMessage: reason };
  }

  /** Toute erreur du port `AIProvider`/du schéma de sortie est une `DomainError` normalisée (voir
   *  `domain/errors.ts`) — un code générique couvre uniquement l'improbable erreur non normalisée
   *  (bug d'adapter), jamais exposé tel quel à l'appelant HTTP (message déjà sûr, sans secret). */
  private errorCode(error: unknown): string {
    if (error && typeof error === "object" && "code" in error && typeof (error as { code: unknown }).code === "string") {
      return (error as { code: string }).code;
    }
    return "AI_INVALID_RESPONSE";
  }

  /** Traduit le code d'erreur normalisé d'une tentative échouée en signaux déterministes pour
   *  `evaluateEscalationConditions` (Sprint 5.2 §"Fallback simple") — jamais le score auto-déclaré
   *  du modèle : uniquement des codes d'erreur déjà normalisés par `domain/errors.ts`. */
  private toEscalationSignals(errorCode: string): EscalationSignals {
    return {
      jsonValid: errorCode !== "AI_SCHEMA_VALIDATION_FAILED" && errorCode !== "AI_INVALID_RESPONSE",
      provenanceStatus: errorCode === "AI_PROVENANCE_VALIDATION_FAILED" ? "CITATION_NOT_FOUND" : "NOT_APPLICABLE",
      complete: true,
      providerErrorOccurred:
        errorCode === "AI_PROVIDER_UNAVAILABLE" ||
        errorCode === "AI_RATE_LIMITED" ||
        errorCode === "AI_AUTHENTICATION_FAILED" ||
        errorCode === "AI_PROVIDER_NOT_CONFIGURED",
      timedOut: errorCode === "AI_TIMEOUT",
    };
  }

  /** Best-effort, hors transaction (mission §"Observabilité") — l'écriture de l'AnalysisAttempt
   *  n'est plus journalisée ici (correction P1-02 : elle est désormais atomique avec la
   *  finalisation du job, voir `AnalysisJobRepository.finalizeAttempt`). Seul l'audit log reste
   *  best-effort : sa perte éventuelle n'affecte jamais le résultat métier déjà acquis.
   *
   *  Traçabilité minimale du routage (Sprint 5.2) — `routingPolicyVersion`/`escalated`/
   *  `escalationReason` ne sont ajoutés au `metadata` QUE lorsqu'une RoutingPolicy a réellement été
   *  consultée : `undefined` = chemin legacy, jamais une valeur fabriquée. */
  private async recordAuditLog(
    command: ProcessAnalysisJobCommand,
    outcome: FinalizeAttemptOutcome,
    routing: { routingPolicyVersion?: number | undefined; escalated: boolean; escalationReason?: string | undefined },
  ): Promise<void> {
    try {
      const routingMetadata =
        routing.routingPolicyVersion !== undefined
          ? { routingPolicyVersion: routing.routingPolicyVersion, escalated: routing.escalated, escalationReason: routing.escalationReason }
          : {};
      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorType: "SYSTEM",
        action: outcome.kind === "failed" ? "analysis.failed" : "analysis.completed",
        resourceType: "analysis_job",
        resourceId: command.jobId,
        requestId: command.requestId,
        metadata:
          outcome.kind === "failed"
            ? { errorCode: outcome.errorCode, ...routingMetadata }
            : { outcome: outcome.kind, totalTokenCount: outcome.totalTokenCount, ...routingMetadata },
      });
    } catch (auditError) {
      this.logger.error(
        `Analysis job ${command.jobId} reached a final state (${outcome.kind}) but the audit log write failed: ` +
          `${auditError instanceof Error ? auditError.message : String(auditError)}`,
      );
    }
  }

  /** Audit Codex P1-4 — persistance DURABLE de la décision de routage, distincte du journal
   *  d'audit best-effort (`recordAuditLog`). Créée avant le premier appel provider. Une erreur ici
   *  ne fait jamais échouer l'analyse (même discipline que le reste de l'observabilité), mais n'est
   *  JAMAIS silencieuse : journalisée en ERROR, jamais en DEBUG/ignorée (mission "une erreur de
   *  persistance de la décision ne doit pas être silencieusement ignorée"). Absente de tout prompt/
   *  document/clé API — uniquement des métadonnées d'exécution. */
  private async createRoutingDecision(input: {
    id: string;
    command: ProcessAnalysisJobCommand;
    job: AnalysisJob;
    resolution: ResolvedModelForAnalysis;
  }): Promise<void> {
    if (!this.routingDecisionWriter) return;
    try {
      await this.routingDecisionWriter.create({
        id: input.id,
        organizationId: input.command.organizationId,
        tenderId: input.job.tenderId,
        analysisId: input.job.id,
        promptKey: mapScopeToPromptKey(input.job.scope),
        routingPolicyId: input.resolution.routingPolicyId,
        routingPolicyVersion: input.resolution.routingPolicyVersion,
        primaryProvider: input.resolution.provider ?? this.config.aiProvider ?? "UNKNOWN",
        primaryModel: input.resolution.model,
        occurredAt: this.clock.now(),
      });
    } catch (error) {
      this.logger.error(
        `Failed to persist routing decision ${input.id} for analysis job ${input.job.id} (analysis continues normally): ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Audit Codex P1-4 — mise à jour finale (une seule fois), qu'il y ait eu escalade ou non. */
  private async completeRoutingDecision(input: {
    id: string;
    outcome: FinalizeAttemptOutcome;
    escalated: boolean;
  }): Promise<void> {
    if (!this.routingDecisionWriter) return;
    try {
      await this.routingDecisionWriter.complete({
        id: input.id,
        selectedProvider: input.outcome.provider,
        selectedModel: input.outcome.model,
        fallbackLevel: input.escalated ? 1 : 0,
        fallbackAttempts: input.escalated ? 1 : 0,
        inputTokenCount: input.outcome.kind === "failed" ? undefined : input.outcome.inputTokenCount,
        outputTokenCount: input.outcome.kind === "failed" ? undefined : input.outcome.outputTokenCount,
        latencyMs: input.outcome.kind === "failed" ? undefined : input.outcome.durationMs,
        status: input.outcome.kind === "failed" ? "FAILED" : "SUCCEEDED",
        failureReason: input.outcome.kind === "failed" ? input.outcome.errorCode : undefined,
        occurredAt: this.clock.now(),
      });
    } catch (error) {
      this.logger.error(
        `Failed to complete routing decision ${input.id} (analysis result already acquired, unaffected): ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
