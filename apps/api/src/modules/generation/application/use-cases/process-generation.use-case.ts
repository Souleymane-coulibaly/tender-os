import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import {
  AiTimeoutError,
  AI_PROVIDER_REGISTRY,
  evaluateEscalationConditions,
  type AIProvider,
  type AIProviderRegistry,
  type AIProviderRequest,
  type AIProviderResult,
  type EscalationSignals,
} from "../../../analysis";
import {
  validateGenerationCitations,
  type KnownKnowledgeReferences,
} from "../../domain/generation-citation-validator";
import { GenerationOutputMode } from "../../domain/generation-output-mode";
import {
  GenerationSchemaValidationFailedError,
  NoActiveRoutingPolicyError,
  PromptTemplateNotFoundError,
  PromptVersionNotFoundError,
  RoutingDecisionPersistenceFailedError,
} from "../../domain/errors";
import { GENERATION_CONFIG, type GenerationConfig } from "../../infrastructure/generation-config";
import { isRetryableAiError } from "../policies/ai-error-classification";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import type { FinalizeGenerationOutcome } from "../ports/generation.repository";
import { GENERATION_REPOSITORY, type GenerationRepository } from "../ports/generation.repository";
import { PROMPT_RENDERER, type PromptRenderer } from "../ports/prompt-renderer";
import { PROMPT_TEMPLATE_REPOSITORY, type PromptTemplateRepository } from "../ports/prompt-template.repository";
import { PROMPT_VERSION_REPOSITORY, type PromptVersionRepository } from "../ports/prompt-version.repository";
import {
  GENERATION_ROUTING_DECISION_WRITER,
  type CompleteRoutingDecisionResult,
  type RoutingDecisionWriter,
} from "../ports/routing-decision-writer";
import { ROUTING_POLICY_RESOLVER, type ActiveRoutingDecision, type RoutingPolicyResolver } from "../ports/routing-policy-resolver";
import { estimateGenerationCost } from "../services/estimate-generation-cost";
import { GenerationContextBuilder, type GenerationContext } from "../services/generation-context-builder";
import { getStructuredOutputSchema } from "../services/structured-output-registry";

export type ProcessGenerationCommand = Readonly<{
  organizationId: string;
  generationId: string;
  requestId?: string | undefined;
}>;

type Phase2Result =
  | { outcome: FinalizeGenerationOutcome & { kind: "generated" }; retryCount: number }
  | { outcome: FinalizeGenerationOutcome & { kind: "failed" }; retryCount: number };

/** Métadonnées de routage réellement résolues pour CETTE génération — attachées à l'outcome final,
 *  qu'il s'agisse d'un succès ou d'un échec survenu APRÈS la création de la décision (correctif
 *  Sprint 6, audit Codex P1-2). `undefined` uniquement lorsque la génération a échoué AVANT toute
 *  résolution (voir `NoActiveRoutingPolicyError`). */
type ResolvedRouting = Readonly<{ routingPolicyId: string; routingPolicyVersion: number; routingDecisionId?: string | undefined }>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Orchestrateur de génération — même motif en 3 phases que `ProcessAnalysisJobUseCase` : jamais un
 * appel provider dans une transaction Prisma.
 * 1. `reserveForGenerating` — réservation atomique COURTE (PENDING → GENERATING).
 * 2. Résolution OBLIGATOIRE d'une `RoutingPolicy` active (correctif Sprint 6, audit Codex P1-1 —
 *    "routing dormant") : contrairement à `resolveModelForAnalysis` (qui retombe sur un modèle
 *    legacy Sprint 4.1/4.2, un comportement PRÉ-EXISTANT et validé), Generation n'a aucun
 *    comportement historique à préserver — l'absence de policy active est donc un échec explicite
 *    (`NoActiveRoutingPolicyError`), jamais un repli silencieux sur `GenerationConfig.aiModel`.
 * 3. Une fois une policy résolue : création d'une VRAIE `RoutingDecision` Sprint 5.2 (correctif
 *    P1-2) AVANT le premier appel provider, `runPhase2` (contexte, rendu, appel provider HORS
 *    transaction, validation stricte schéma + citations — jamais persisté si invalide), puis
 *    complétion de la décision (coût réel via les pricing snapshots Sprint 5.2, correctif P2-3).
 * 4. `finalizeGeneration` — finalisation atomique COURTE, compare-and-set sur `attemptCount`.
 */
@Injectable()
export class ProcessGenerationUseCase {
  private readonly logger = new Logger(ProcessGenerationUseCase.name);

  constructor(
    @Inject(GENERATION_REPOSITORY) private readonly generationRepository: GenerationRepository,
    @Inject(AI_PROVIDER_REGISTRY) private readonly providerRegistry: AIProviderRegistry,
    @Inject(PROMPT_TEMPLATE_REPOSITORY) private readonly promptTemplateRepository: PromptTemplateRepository,
    @Inject(PROMPT_VERSION_REPOSITORY) private readonly promptVersionRepository: PromptVersionRepository,
    @Inject(PROMPT_RENDERER) private readonly promptRenderer: PromptRenderer,
    private readonly contextBuilder: GenerationContextBuilder,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(GENERATION_CONFIG) private readonly config: GenerationConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    // Optionnel — même discipline que ProcessAnalysisJobUseCase : absent (RoutingPolicyBridgeModule
    // non importé), ce use case échoue explicitement CHAQUE génération avec NoActiveRoutingPolicyError,
    // jamais un crash au démarrage ni un repli silencieux.
    @Optional() @Inject(ROUTING_POLICY_RESOLVER) private readonly routingPolicyResolver?: RoutingPolicyResolver,
    @Optional() @Inject(GENERATION_ROUTING_DECISION_WRITER) private readonly routingDecisionWriter?: RoutingDecisionWriter,
  ) {}

  async execute(command: ProcessGenerationCommand): Promise<void> {
    const reservedAt = this.clock.now();
    const reservation = await this.generationRepository.reserveForGenerating({
      organizationId: command.organizationId,
      generationId: command.generationId,
      occurredAt: reservedAt,
    });

    if (reservation.kind === "not_startable") {
      this.logger.warn(`Skipping generation ${command.generationId}: status is ${reservation.status}, not startable.`);
      return;
    }

    const { generation } = reservation;

    const template = await this.promptTemplateRepository.findById({
      organizationId: command.organizationId,
      templateId: generation.promptTemplateId,
    });
    const version = await this.promptVersionRepository.findById({
      organizationId: command.organizationId,
      versionId: generation.promptVersionId,
    });
    if (!template || !version) {
      const outcome: FinalizeGenerationOutcome = {
        kind: "failed",
        errorCode: !template ? new PromptTemplateNotFoundError().code : new PromptVersionNotFoundError().code,
        errorMessage: "The prompt template or version referenced by this generation no longer exists.",
      };
      await this.finalize(command, generation.attemptCount, outcome);
      await this.recordAuditLog(command, outcome);
      return;
    }

    const decision = await this.resolveActivePolicy(command.organizationId, generation.taskType, command.generationId);
    if (!decision) {
      const error = new NoActiveRoutingPolicyError();
      const outcome: FinalizeGenerationOutcome = { kind: "failed", errorCode: error.code, errorMessage: error.message };
      await this.finalize(command, generation.attemptCount, outcome);
      await this.recordAuditLog(command, outcome);
      return;
    }

    const routingDecisionId = this.idGenerator.generate();
    const decisionCreated = await this.createRoutingDecision({
      id: routingDecisionId,
      command,
      generation,
      decision,
    });
    if (!decisionCreated) {
      // Correctif Sprint 6 (audit Codex P1-2) — une policy active a été trouvée mais la décision n'a
      // pas pu être persistée durablement : jamais d'appel provider sans trace de routage
      // exploitable, jamais un succès non traçable. L'erreur DÉTAILLÉE est déjà journalisée en ERROR
      // par `createRoutingDecision` (jamais silencieuse) ; ce code reste générique côté génération.
      const persistenceError = new RoutingDecisionPersistenceFailedError();
      const outcome: FinalizeGenerationOutcome = {
        kind: "failed",
        routingPolicyId: decision.policyId,
        routingPolicyVersion: decision.policyVersion,
        errorCode: persistenceError.code,
        errorMessage: persistenceError.message,
      };
      await this.finalize(command, generation.attemptCount, outcome);
      await this.recordAuditLog(command, outcome);
      return;
    }

    let { outcome } = await this.runPhase2({
      organizationId: command.organizationId,
      generation,
      template: { outputMode: template.outputMode, structuredSchemaKey: template.structuredSchemaKey },
      version,
      selector: { provider: decision.primaryModel.provider, model: decision.primaryModel.modelKey },
    });

    let fallbackLevel = 0;
    if (outcome.kind === "failed" && decision.escalationModel) {
      const reason = evaluateEscalationConditions(this.toEscalationSignals(outcome.errorCode), decision.escalationConditions);
      if (reason) {
        this.logger.warn(`Generation ${command.generationId} escalating to fallback model after "${reason}".`);
        const escalationResult = await this.runPhase2({
          organizationId: command.organizationId,
          generation,
          template: { outputMode: template.outputMode, structuredSchemaKey: template.structuredSchemaKey },
          version,
          selector: { provider: decision.escalationModel.provider, model: decision.escalationModel.modelKey },
          fallbackLevel: 1,
        });
        outcome = escalationResult.outcome;
        fallbackLevel = 1;
      }
    }

    const realCost = await this.completeRoutingDecision({
      id: routingDecisionId,
      outcome,
      fallbackLevel,
    });

    const routing: ResolvedRouting = {
      routingPolicyId: decision.policyId,
      routingPolicyVersion: decision.policyVersion,
      routingDecisionId,
    };
    const finalOutcome: FinalizeGenerationOutcome =
      outcome.kind === "generated"
        ? {
            ...outcome,
            ...routing,
            estimatedCostAmount: realCost.actualCostAmount ?? outcome.estimatedCostAmount,
            currency: realCost.currency ?? outcome.currency,
          }
        : { ...outcome, ...routing };

    await this.finalize(command, generation.attemptCount, finalOutcome);
    await this.recordAuditLog(command, finalOutcome);
  }

  /** Correctif Sprint 6 (audit Codex P1-1) — résolution OBLIGATOIRE, jamais de repli. Toute erreur
   *  du résolveur (absence de câblage, erreur infra) est traitée identiquement à "aucune policy
   *  active" : le résolveur cassé n'a jamais existé pour cette génération, jamais une cause
   *  d'exception non gérée. */
  private async resolveActivePolicy(
    organizationId: string,
    taskType: string,
    generationId: string,
  ): Promise<ActiveRoutingDecision | null> {
    if (!this.routingPolicyResolver) return null;
    try {
      return await this.routingPolicyResolver.resolveActive({ organizationId, promptKey: taskType });
    } catch (error) {
      this.logger.warn(
        `Routing policy resolution failed for generation ${generationId} (treated as "no active policy"): ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /** Correctif Sprint 6 (audit Codex P1-2) — persistance DURABLE de la décision de routage, créée
   *  AVANT le premier appel provider. Contrairement à `ProcessAnalysisJobUseCase.createRoutingDecision`
   *  (best-effort, une erreur ici ne fait jamais échouer l'analyse legacy), un échec ici FAIT échouer
   *  la génération : la policy résolue est désormais la SEULE source de vérité du modèle utilisé,
   *  une décision non persistée signifierait un appel provider non traçable — exactement ce que cet
   *  audit corrige. L'erreur est toujours journalisée en ERROR, jamais silencieuse. */
  private async createRoutingDecision(input: {
    id: string;
    command: ProcessGenerationCommand;
    generation: { id: string; organizationId: string; clientAccountId: string; tenderId: string; taskType: string };
    decision: ActiveRoutingDecision;
  }): Promise<boolean> {
    if (!this.routingDecisionWriter) {
      this.logger.error(
        `No RoutingDecisionWriter wired for generation ${input.generation.id} despite an active routing policy — ` +
          `RoutingPolicyBridgeModule is likely not imported by AppModule.`,
      );
      return false;
    }
    try {
      await this.routingDecisionWriter.create({
        id: input.id,
        organizationId: input.command.organizationId,
        clientAccountId: input.generation.clientAccountId,
        tenderId: input.generation.tenderId,
        generationId: input.generation.id,
        taskType: input.generation.taskType,
        routingPolicyId: input.decision.policyId,
        routingPolicyVersion: input.decision.policyVersion,
        primaryProvider: input.decision.primaryModel.provider,
        primaryModel: input.decision.primaryModel.modelKey,
        occurredAt: this.clock.now(),
      });
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to persist routing decision ${input.id} for generation ${input.generation.id} (generation will fail): ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /** Correctif Sprint 6 (audit Codex P1-2/P2-3) — complétion best-effort : le RÉSULTAT de la
   *  génération est déjà acquis à cet appel, une erreur ici ne doit jamais le remettre en cause (même
   *  discipline que `ProcessAnalysisJobUseCase.completeRoutingDecision`). Le coût réel (pricing
   *  snapshots Sprint 5.2) est renvoyé à l'appelant pour être attaché à la `Generation` elle-même —
   *  `{}` si indisponible, jamais un coût inventé. */
  private async completeRoutingDecision(input: {
    id: string;
    outcome: FinalizeGenerationOutcome & { kind: "generated" | "failed" };
    fallbackLevel: number;
  }): Promise<CompleteRoutingDecisionResult> {
    if (!this.routingDecisionWriter) return {};
    try {
      return await this.routingDecisionWriter.complete({
        id: input.id,
        selectedProvider: input.outcome.modelProvider,
        selectedModel: input.outcome.modelKey,
        fallbackLevel: input.fallbackLevel,
        fallbackAttempts: input.fallbackLevel,
        inputTokenCount: input.outcome.kind === "generated" ? input.outcome.inputTokenCount : undefined,
        outputTokenCount: input.outcome.kind === "generated" ? input.outcome.outputTokenCount : undefined,
        latencyMs: input.outcome.kind === "generated" ? input.outcome.latencyMs : undefined,
        status: input.outcome.kind === "generated" ? "SUCCEEDED" : "FAILED",
        failureReason: input.outcome.kind === "failed" ? input.outcome.errorCode : undefined,
        occurredAt: this.clock.now(),
      });
    } catch (error) {
      this.logger.error(
        `Failed to complete routing decision ${input.id} (generation result already acquired, unaffected): ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      return {};
    }
  }

  private async finalize(command: ProcessGenerationCommand, expectedAttemptCount: number, outcome: FinalizeGenerationOutcome): Promise<void> {
    try {
      const result = await this.generationRepository.finalizeGeneration({
        organizationId: command.organizationId,
        generationId: command.generationId,
        expectedAttemptCount,
        occurredAt: this.clock.now(),
        outcome,
      });
      if (!result.applied) {
        this.logger.warn(
          `Finalization for generation ${command.generationId} discarded: the reservation (attempt ${expectedAttemptCount}) is no longer current.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Finalization failed for generation ${command.generationId}, left GENERATING: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Intégralement hors transaction Prisma — construction du contexte, rendu, appel provider avec
   *  timeout/retry bornés, validation stricte (schéma structuré + citations, jamais une confiance
   *  auto-déclarée). Appelée une seconde fois pour l'unique palier d'escalade autorisé. Le coût
   *  calculé ici (`estimateGenerationCost`, configuration statique) reste un REPLI informatif —
   *  `execute()` le remplace par le coût réel des pricing snapshots Sprint 5.2 quand disponible
   *  (correctif P2-3), jamais l'inverse. */
  private async runPhase2(input: {
    organizationId: string;
    generation: { id: string; tenderId: string; taskType: string; targetRef?: string | undefined; createdBy: string; createdByRole?: string | undefined };
    template: { outputMode: string; structuredSchemaKey?: string | undefined };
    version: Parameters<PromptRenderer["render"]>[0];
    selector: { provider?: string | undefined; model: string };
    fallbackLevel?: number;
  }): Promise<Phase2Result> {
    const fallbackLevel = input.fallbackLevel ?? 0;
    let provider: AIProvider;
    try {
      provider = this.providerRegistry.resolve(input.selector.provider ? { provider: input.selector.provider } : undefined);
    } catch (error) {
      return { outcome: this.toFailureOutcome(error), retryCount: 0 };
    }

    let context: GenerationContext;
    try {
      context = await this.contextBuilder.build({
        organizationId: input.organizationId,
        tenderId: input.generation.tenderId,
        taskType: input.generation.taskType as never,
        targetRef: input.generation.targetRef,
        actorId: input.generation.createdBy,
        actorRole: input.generation.createdByRole ?? "OWNER",
      });
    } catch (error) {
      return { outcome: this.toFailureOutcome(error, provider.name, input.selector.model), retryCount: 0 };
    }

    let rendered: ReturnType<PromptRenderer["render"]>;
    try {
      rendered = this.promptRenderer.render(input.version, context.variables);
    } catch (error) {
      return { outcome: this.toFailureOutcome(error, provider.name, input.selector.model), retryCount: 0 };
    }

    const maxAttempts = 1 + this.config.aiMaxRetries;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.callWithTimeout(provider, {
          model: input.selector.model,
          systemPrompt: rendered.systemPrompt,
          userPrompt: rendered.userPrompt,
          responseSchemaName: input.template.structuredSchemaKey ?? "free_text",
          timeoutMs: this.config.aiTimeoutMs,
        });

        const parsed = this.parseAndValidate(result.content, input.template, context.knownKnowledgeReferences);

        const cost = estimateGenerationCost({
          provider: provider.name,
          modelKey: input.selector.model,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          modelRates: this.config.modelRates,
        });

        return {
          outcome: {
            kind: "generated",
            modelProvider: provider.name,
            modelKey: input.selector.model,
            fallbackLevel,
            generatedContent: parsed.generatedContent,
            structuredContent: parsed.structuredContent,
            inputTokenCount: result.usage.inputTokens,
            outputTokenCount: result.usage.outputTokens,
            totalTokenCount: result.usage.totalTokens,
            estimatedCostAmount: cost?.amount,
            currency: cost?.currency,
            latencyMs: result.durationMs,
          },
          retryCount: attempt - 1,
        };
      } catch (error) {
        const isLastAttempt = attempt === maxAttempts;
        if (!isRetryableAiError(error) || isLastAttempt) {
          return { outcome: this.toFailureOutcome(error, provider.name, input.selector.model), retryCount: attempt - 1 };
        }
        this.logger.warn(
          `AI provider call failed (retryable) for generation ${input.generation.id}, attempt ${attempt}/${maxAttempts}: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
        await sleep(this.config.aiRetryDelayMs * attempt);
      }
    }

    // Inatteignable (maxAttempts >= 1 garantit une sortie dans la boucle) — TypeScript exhaustif.
    return { outcome: this.toFailureOutcome(new AiTimeoutError({ timeoutMs: this.config.aiTimeoutMs })), retryCount: maxAttempts - 1 };
  }

  /** JSON.parse + validation Zod (mode STRUCTURED) hors transaction — une sortie invalide n'est
   *  JAMAIS persistée comme génération réussie (mission §"Ne persiste pas une réponse structurée
   *  invalide comme génération valide"). Les citations sont vérifiées contre le contexte
   *  RÉELLEMENT fourni au prompt, jamais une confiance auto-déclarée par le modèle. */
  private parseAndValidate(
    rawContent: string,
    template: { outputMode: string; structuredSchemaKey?: string | undefined },
    knownKnowledgeReferences: KnownKnowledgeReferences,
  ): { generatedContent?: string; structuredContent?: unknown } {
    if (template.outputMode !== GenerationOutputMode.Structured) {
      return { generatedContent: rawContent };
    }

    let json: unknown;
    try {
      json = JSON.parse(rawContent);
    } catch {
      throw new GenerationSchemaValidationFailedError({ reason: "response is not valid JSON" });
    }

    const schema = template.structuredSchemaKey ? getStructuredOutputSchema(template.structuredSchemaKey) : undefined;
    if (!schema) {
      throw new GenerationSchemaValidationFailedError({ reason: `no schema registered for key "${template.structuredSchemaKey}"` });
    }

    const result = schema.safeParse(json);
    if (!result.success) {
      throw new GenerationSchemaValidationFailedError({
        reason: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
      });
    }

    const sources = (result.data as { sources?: readonly { knowledgeEntryId: string; citation?: string }[] }).sources ?? [];
    validateGenerationCitations(sources, knownKnowledgeReferences);

    return { structuredContent: result.data };
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

  private toFailureOutcome(error: unknown, provider?: string, model?: string): FinalizeGenerationOutcome & { kind: "failed" } {
    const code = this.errorCode(error);
    const reason = error instanceof Error ? error.message : String(error);
    this.logger.error(`Generation processing failed (${code}): ${reason}`);
    return { kind: "failed", modelProvider: provider, modelKey: model, errorCode: code, errorMessage: reason };
  }

  private errorCode(error: unknown): string {
    if (error && typeof error === "object" && "code" in error && typeof (error as { code: unknown }).code === "string") {
      return (error as { code: string }).code;
    }
    return "GENERATION_UNKNOWN_ERROR";
  }

  private toEscalationSignals(errorCode: string): EscalationSignals {
    return {
      jsonValid: errorCode !== "GENERATION_SCHEMA_VALIDATION_FAILED" && errorCode !== "AI_INVALID_RESPONSE",
      provenanceStatus: errorCode === "GENERATION_CITATION_VALIDATION_FAILED" ? "CITATION_NOT_FOUND" : "NOT_APPLICABLE",
      complete: true,
      providerErrorOccurred:
        errorCode === "AI_PROVIDER_UNAVAILABLE" ||
        errorCode === "AI_RATE_LIMITED" ||
        errorCode === "AI_AUTHENTICATION_FAILED" ||
        errorCode === "AI_PROVIDER_NOT_CONFIGURED",
      timedOut: errorCode === "AI_TIMEOUT",
    };
  }

  private async recordAuditLog(command: ProcessGenerationCommand, outcome: FinalizeGenerationOutcome): Promise<void> {
    try {
      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorType: "SYSTEM",
        action: outcome.kind === "failed" ? "generation.failed" : "generation.completed",
        resourceType: "generation",
        resourceId: command.generationId,
        requestId: command.requestId,
        metadata: outcome.kind === "failed" ? { errorCode: outcome.errorCode } : { fallbackLevel: outcome.fallbackLevel },
      });
    } catch (auditError) {
      this.logger.error(
        `Generation ${command.generationId} reached a final state (${outcome.kind}) but the audit log write failed: ` +
          `${auditError instanceof Error ? auditError.message : String(auditError)}`,
      );
    }
  }
}
