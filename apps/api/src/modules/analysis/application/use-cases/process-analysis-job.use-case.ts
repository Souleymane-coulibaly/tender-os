import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { AnalysisJob } from "../../domain/analysis-job.aggregate";
import { AnalysisScope } from "../../domain/analysis-scope";
import { AnalysisTrigger } from "../../domain/analysis-trigger";
import { AiTimeoutError } from "../../domain/errors";
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
import type { PrismaTx } from "../ports/business-analysis.repository";
import { ANALYSIS_CONFIG, type AnalysisConfig } from "../../infrastructure/analysis-config";

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

/** Mission Sprint 4.2 §"Pas de modèle codé en dur dans le domaine" — stratégie simple par type de
 *  tâche, jamais un moteur d'arbitrage : un scope DOCUMENT et un scope TENDER peuvent utiliser des
 *  modèles différents (ex. un modèle moins coûteux pour l'extraction par document, un modèle plus
 *  capable pour la consolidation), configurés via `AnalysisConfig`, jamais en dur ici. */
function resolveModelForScope(config: AnalysisConfig, scope: AnalysisScope): string {
  return scope === AnalysisScope.Document ? config.aiModelForDocumentAnalysis : config.aiModelForTenderConsolidation;
}

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

    const { outcome, retryCount, onSuccessTx } = await this.runPhase2(job, resolveModelForScope(this.config, job.scope));

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

    await this.recordAuditLog(command, outcome);
  }

  /** Intégralement hors transaction Prisma (mission §"Pas de transaction longue") — résolution du
   *  provider et du contenu métier réel (`AnalysisContentResolver`, mission Sprint 4.2), appel
   *  réseau avec timeout et retry bornés, validation stricte du schéma de sortie. Ne touche jamais
   *  la base : `onSuccessTx` n'est qu'une fonction préparée, invoquée plus tard par
   *  `finalizeAttempt`. */
  private async runPhase2(job: AnalysisJob, model: string): Promise<Phase2Result> {
    let provider: AIProvider;
    try {
      provider = this.providerRegistry.resolve();
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

  /** Best-effort, hors transaction (mission §"Observabilité") — l'écriture de l'AnalysisAttempt
   *  n'est plus journalisée ici (correction P1-02 : elle est désormais atomique avec la
   *  finalisation du job, voir `AnalysisJobRepository.finalizeAttempt`). Seul l'audit log reste
   *  best-effort : sa perte éventuelle n'affecte jamais le résultat métier déjà acquis. */
  private async recordAuditLog(command: ProcessAnalysisJobCommand, outcome: FinalizeAttemptOutcome): Promise<void> {
    try {
      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorType: "SYSTEM",
        action: outcome.kind === "failed" ? "analysis.failed" : "analysis.completed",
        resourceType: "analysis_job",
        resourceId: command.jobId,
        requestId: command.requestId,
        metadata:
          outcome.kind === "failed"
            ? { errorCode: outcome.errorCode }
            : { outcome: outcome.kind, totalTokenCount: outcome.totalTokenCount },
      });
    } catch (auditError) {
      this.logger.error(
        `Analysis job ${command.jobId} reached a final state (${outcome.kind}) but the audit log write failed: ` +
          `${auditError instanceof Error ? auditError.message : String(auditError)}`,
      );
    }
  }
}
