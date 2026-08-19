import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { AI_PROVIDER_REGISTRY, AiTimeoutError, GetEffectiveTenderAnalysisSummaryUseCase, type AIProvider, type AIProviderRegistry, type AIProviderRequest, type AIProviderResult } from "../../../analysis";
import { ClientPermission } from "../../../client-portfolio";
import { TechnicalMemoCoverageStatus, TechnicalMemoSectionRevisionSource } from "../../domain/enums";
import { TechnicalMemoAnalysisNotCurrentError, TechnicalMemoSectionNotFoundError } from "../../domain/errors";
import { TechnicalMemoSectionCitation } from "../../domain/technical-memo-section-citation.value-object";
import { TechnicalMemoSectionRevision } from "../../domain/technical-memo-section-revision.entity";
import { buildTechnicalMemoSystemPrompt, TECHNICAL_MEMO_SYSTEM_PROMPT_VERSION } from "../../infrastructure/technical-memo-system-prompt";
import { TECHNICAL_MEMO_AI_CONFIG, type TechnicalMemoAiConfig } from "../../infrastructure/technical-memo-ai-config";
import { isRetryableAiError } from "../policies/ai-error-classification";
import { assertTechnicalMemoAccess } from "../policies/technical-memo-access.policy";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { ROUTING_POLICY_RESOLVER, type RoutingPolicyResolver } from "../ports/routing-policy-resolver";
import { ROUTING_DECISION_WRITER, type RoutingDecisionWriter } from "../ports/routing-decision-writer";
import { TECHNICAL_MEMO_SECTION_REPOSITORY, type TechnicalMemoSectionRepository } from "../ports/technical-memo-section.repository";
import {
  TECHNICAL_MEMO_SECTION_REQUIREMENT_REPOSITORY,
  type TechnicalMemoSectionRequirementRepository,
} from "../ports/technical-memo-section-requirement.repository";
import { TECHNICAL_MEMO_SECTION_REVISION_REPOSITORY, type TechnicalMemoSectionRevisionRepository } from "../ports/technical-memo-section-revision.repository";
import { TechnicalMemoAccessService } from "../services/technical-memo-access.service";
import { TechnicalMemoSectionContextAssembler } from "../services/technical-memo-section-context-assembler";
import { validateTechnicalMemoCitations, type KnownTechnicalMemoReference, type KnownTechnicalMemoReferences } from "../services/technical-memo-citation-validator";
import { TechnicalMemoSectionResponseSchema } from "../services/technical-memo-section-response-schema";

export type GenerateTechnicalMemoSectionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  technicalMemoId: string;
  technicalMemoSectionId: string;
  /** Mission §41 — instruction utilisateur pour une régénération guidée (ex. "insister davantage
   *  sur la cybersécurité"), conservée sur la révision, jamais appliquée à une révision différente. */
  userInstruction?: string | undefined;
  requestId?: string | undefined;
}>;

const MAX_OUTPUT_TOKENS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type DeclaredCitationMatch = Readonly<{ reference: KnownTechnicalMemoReference; excerpt: string | undefined }>;

type GenerationOutcome =
  | {
      kind: "completed";
      content: string;
      model: string;
      citationMatches: readonly DeclaredCitationMatch[];
      missingDataNotes: readonly string[];
      usage: AIProviderResult["usage"];
      /** Checkpoint 2.1-P2.1-FIX-D — provenance figée AU MOMENT de cet appel, jamais relue dans
       *  `finalize()` (mission §18/§39 "jamais les sources courantes relues à la fin"). */
      candidateCompanyId: string | undefined;
      analysisVersion: number | undefined;
      dceRevision: number | undefined;
    }
  | { kind: "failed"; errorMessage: string };

/**
 * Génération IA d'UNE section, section par section (mission §31 "jamais un appel géant pour tout le
 * mémoire") — même architecture deux-phases que `SendMessageUseCase` (Sprint 9) : (1) verrou +
 * passage GENERATING dans une transaction courte, (2) assemblage du contexte + appel IA + validation
 * HORS transaction (jamais un appel réseau dans une transaction Prisma), (3) finalisation
 * (révision + citations + section) dans une seconde transaction courte. Sert À LA FOIS la première
 * génération (source AI_GENERATED) et une régénération explicite (source AI_REGENERATED,
 * `revisionNumber > 1`) — jamais un second use-case dupliqué (mission §40).
 */
@Injectable()
export class GenerateTechnicalMemoSectionUseCase {
  private readonly logger = new Logger(GenerateTechnicalMemoSectionUseCase.name);

  constructor(
    @Inject(TECHNICAL_MEMO_SECTION_REPOSITORY) private readonly sectionRepository: TechnicalMemoSectionRepository,
    @Inject(TECHNICAL_MEMO_SECTION_REVISION_REPOSITORY) private readonly revisionRepository: TechnicalMemoSectionRevisionRepository,
    @Inject(TECHNICAL_MEMO_SECTION_REQUIREMENT_REPOSITORY) private readonly requirementRepository: TechnicalMemoSectionRequirementRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    @Inject(AI_PROVIDER_REGISTRY) private readonly providerRegistry: AIProviderRegistry,
    @Inject(TECHNICAL_MEMO_AI_CONFIG) private readonly config: TechnicalMemoAiConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly accessService: TechnicalMemoAccessService,
    private readonly contextAssembler: TechnicalMemoSectionContextAssembler,
    private readonly getEffectiveTenderAnalysisSummaryUseCase: GetEffectiveTenderAnalysisSummaryUseCase,
    // Consolidation IA — Checkpoint A §3 : résolveur optionnel (motif d'Analyse, jamais celui,
    // obligatoire, de Génération — Mémoire technique a un comportement historique à préserver).
    // Absent ⇒ repli strict sur `TechnicalMemoAiConfig.aiModel`, jamais une exception.
    @Optional() @Inject(ROUTING_POLICY_RESOLVER) private readonly routingPolicyResolver?: RoutingPolicyResolver,
    // Consolidation IA — Checkpoint D : writer optionnel (même motif best-effort qu'Analyse) — absent
    // ou en échec, la décision n'est simplement pas persistée durablement, jamais une cause d'échec
    // de la génération de section elle-même (voir `createRoutingDecision`/`completeRoutingDecision`).
    @Optional() @Inject(ROUTING_DECISION_WRITER) private readonly routingDecisionWriter?: RoutingDecisionWriter,
  ) {}

  async execute(command: GenerateTechnicalMemoSectionCommand): Promise<TechnicalMemoSectionRevision> {
    const memo = await assertTechnicalMemoAccess(this.accessService, {
      organizationId: command.organizationId,
      technicalMemoId: command.technicalMemoId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      clientPermission: ClientPermission.ManageTechnicalMemo,
      requireUseOrgPermission: true,
    });

    // Checkpoint 2.1-P2.1-FIX-D (mission §22) — bloque AVANT toute mutation d'état (jamais un
    // passage GENERATING suivi d'un échec) : UNIQUEMENT si cette section a réellement des
    // exigences DCE liées (mission §12/§13, jamais une dépendance fabriquée pour une section qui
    // n'en a aucune — voir `TechnicalMemoAnalysisNotCurrentError`).
    await this.assertAnalysisPrecondition(command, memo);

    const section = await this.beginGeneration(command);

    const outcome = await this.generate({ command, memo, section: section });

    return this.finalize(command, outcome);
  }

  private async assertAnalysisPrecondition(command: GenerateTechnicalMemoSectionCommand, memo: Awaited<ReturnType<TechnicalMemoAccessService["loadMemo"]>>): Promise<void> {
    const links = await this.requirementRepository.listBySectionId({ organizationId: command.organizationId, technicalMemoSectionId: command.technicalMemoSectionId });
    if (links.length === 0) return;
    const effectiveAnalysis = await this.getEffectiveTenderAnalysisSummaryUseCase.execute({
      organizationId: command.organizationId,
      tenderId: memo.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
    });
    if (effectiveAnalysis.analysisFreshness !== "CURRENT") {
      throw new TechnicalMemoAnalysisNotCurrentError();
    }
  }

  /** Verrou + passage GENERATING — transaction courte (mission §84 "deux générations concurrentes
   *  de la même section"). */
  private async beginGeneration(command: GenerateTechnicalMemoSectionCommand) {
    return this.atomicTransactionRunner.run(async () => {
      await this.revisionRepository.lockSection({ organizationId: command.organizationId, technicalMemoSectionId: command.technicalMemoSectionId });

      const section = await this.sectionRepository.findById({ organizationId: command.organizationId, technicalMemoSectionId: command.technicalMemoSectionId });
      if (!section || section.technicalMemoId !== command.technicalMemoId) {
        throw new TechnicalMemoSectionNotFoundError();
      }

      const occurredAt = this.clock.now();
      section.markGenerating(occurredAt);
      await this.sectionRepository.save(section);

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorType: "USER",
        actorId: command.actorId,
        action: "technical_memo.section_generation_requested",
        resourceType: "technical_memo_section",
        resourceId: section.id,
        requestId: command.requestId,
        metadata: { technicalMemoId: command.technicalMemoId, userInstruction: command.userInstruction ?? null },
      });

      return section;
    });
  }

  /** Intégralement hors transaction Prisma — même discipline que `SendMessageUseCase.generate`. */
  private async generate(input: { command: GenerateTechnicalMemoSectionCommand; memo: Awaited<ReturnType<TechnicalMemoAccessService["loadMemo"]>>; section: Awaited<ReturnType<TechnicalMemoSectionRepository["findById"]>> }): Promise<GenerationOutcome> {
    const section = input.section!;

    // Consolidation IA — Checkpoint A §3 : consulte le moteur de routing partagé (task type
    // `TECHNICAL_MEMO_SECTION`) avant de retomber sur le modèle statique — jamais une cause
    // d'échec de la génération si la résolution échoue ou ne trouve aucune policy active.
    let resolvedModel = this.config.aiModel;
    let resolvedProvider = this.config.aiProvider;
    let routingPolicyId: string | undefined;
    let routingPolicyVersion: number | undefined;
    if (this.routingPolicyResolver) {
      try {
        const decision = await this.routingPolicyResolver.resolveActive({ organizationId: input.command.organizationId, promptKey: "TECHNICAL_MEMO_SECTION" });
        if (decision) {
          resolvedModel = decision.primaryModel.modelKey;
          resolvedProvider = decision.primaryModel.provider;
          routingPolicyId = decision.policyId;
          routingPolicyVersion = decision.policyVersion;
        }
      } catch (error) {
        this.logger.warn(
          `Routing policy resolution failed for technical memo section ${input.command.technicalMemoSectionId}, falling back to the static model configuration: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    let provider: AIProvider;
    try {
      provider = this.providerRegistry.resolve(resolvedProvider ? { provider: resolvedProvider } : undefined);
    } catch (error) {
      return this.toFailureOutcome(error);
    }

    // Consolidation IA — Checkpoint D : la décision est créée AVANT le premier appel provider
    // (même discipline qu'Analyse/Génération), best-effort — voir `createRoutingDecision`.
    const routingDecisionId = this.idGenerator.generate();
    await this.createRoutingDecision({
      id: routingDecisionId,
      command: input.command,
      tenderId: input.memo.tenderId,
      routingPolicyId,
      routingPolicyVersion,
      primaryProvider: resolvedProvider ?? provider.name,
      primaryModel: resolvedModel,
    });
    const completeRoutingDecision = (outcome: GenerationOutcome): Promise<GenerationOutcome> =>
      this.completeRoutingDecision({ id: routingDecisionId, outcome, selectedProvider: provider.name }).then(() => outcome);

    const context = await this.contextAssembler.assemble({
      organizationId: input.command.organizationId,
      actorId: input.command.actorId,
      actorRole: input.command.actorRole,
      memo: input.memo,
      section,
    });

    const instructionBlock = input.command.userInstruction ? `\n\n### INSTRUCTION DE RÉGÉNÉRATION\n${input.command.userInstruction}` : "";
    const userPrompt = `### SECTION\n${context.sectionBlock}${instructionBlock}\n\n### CONTEXTE\n${context.contextBlock}`;

    const maxAttempts = 1 + this.config.aiMaxRetries;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.callWithTimeout(provider, {
          model: resolvedModel,
          systemPrompt: buildTechnicalMemoSystemPrompt(),
          userPrompt,
          responseSchemaName: "TECHNICAL_MEMO_SECTION_RESPONSE",
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          timeoutMs: this.config.aiTimeoutMs,
        });

        const { citationMatches, missingDataNotes, content } = this.parseAndValidate(result.content, context.knownReferences);
        return await completeRoutingDecision({
          kind: "completed",
          content,
          model: resolvedModel,
          citationMatches,
          missingDataNotes,
          usage: result.usage,
          candidateCompanyId: context.provenance.candidateCompanyId,
          analysisVersion: context.provenance.analysisVersion,
          dceRevision: context.provenance.dceRevision,
        });
      } catch (error) {
        const isLastAttempt = attempt === maxAttempts;
        if (!isRetryableAiError(error) || isLastAttempt) {
          return await completeRoutingDecision(this.toFailureOutcome(error));
        }
        this.logger.warn(`AI provider call failed (retryable) for technical memo section ${input.command.technicalMemoSectionId}, attempt ${attempt}/${maxAttempts}: ${error instanceof Error ? error.message : String(error)}`);
        await sleep(this.config.aiRetryDelayMs * attempt);
      }
    }

    return await completeRoutingDecision(this.toFailureOutcome(new AiTimeoutError({ timeoutMs: this.config.aiTimeoutMs })));
  }

  /** Best-effort (Checkpoint D) — même discipline que `ProcessAnalysisJobUseCase.createRoutingDecision` :
   *  jamais une cause d'échec de la génération, jamais silencieuse non plus (journalisée en ERROR).
   *  Créée avant le premier appel provider. */
  private async createRoutingDecision(input: {
    id: string;
    command: GenerateTechnicalMemoSectionCommand;
    tenderId: string;
    routingPolicyId: string | undefined;
    routingPolicyVersion: number | undefined;
    primaryProvider: string;
    primaryModel: string;
  }): Promise<void> {
    if (!this.routingDecisionWriter) return;
    try {
      await this.routingDecisionWriter.create({
        id: input.id,
        organizationId: input.command.organizationId,
        tenderId: input.tenderId,
        technicalMemoSectionId: input.command.technicalMemoSectionId,
        promptKey: "TECHNICAL_MEMO_SECTION",
        routingPolicyId: input.routingPolicyId,
        routingPolicyVersion: input.routingPolicyVersion,
        primaryProvider: input.primaryProvider,
        primaryModel: input.primaryModel,
        occurredAt: this.clock.now(),
      });
    } catch (error) {
      this.logger.error(
        `Failed to persist routing decision ${input.id} for technical memo section ${input.command.technicalMemoSectionId} (generation continues normally): ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Mise à jour finale (une seule fois) — jamais de palier d'escalade (retry simple sur le même
   *  modèle principal), `fallbackLevel`/`fallbackAttempts` toujours `0`. */
  private async completeRoutingDecision(input: { id: string; outcome: GenerationOutcome; selectedProvider: string }): Promise<void> {
    if (!this.routingDecisionWriter) return;
    try {
      await this.routingDecisionWriter.complete({
        id: input.id,
        selectedProvider: input.outcome.kind === "completed" ? input.selectedProvider : undefined,
        selectedModel: input.outcome.kind === "completed" ? input.outcome.model : undefined,
        fallbackLevel: 0,
        fallbackAttempts: 0,
        inputTokenCount: input.outcome.kind === "completed" ? input.outcome.usage.inputTokens : undefined,
        outputTokenCount: input.outcome.kind === "completed" ? input.outcome.usage.outputTokens : undefined,
        status: input.outcome.kind === "completed" ? "SUCCEEDED" : "FAILED",
        failureReason: input.outcome.kind === "failed" ? input.outcome.errorMessage.slice(0, 60) : undefined,
        occurredAt: this.clock.now(),
      });
    } catch (error) {
      this.logger.error(
        `Failed to complete routing decision ${input.id} (technical memo section result already acquired, unaffected): ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** JSON.parse + validation Zod + validation des citations, HORS transaction — une sortie invalide
   *  n'est JAMAIS persistée (mission §35 "anti-hallucination"). Retourne les références CONNUES
   *  validées (jamais les citations brutes déclarées par le modèle) — la construction des VO
   *  `TechnicalMemoSectionCitation` elle-même n'a lieu qu'une seule fois, dans `finalize`, une fois
   *  le `revisionId` réel connu. */
  private parseAndValidate(rawContent: string, knownReferences: KnownTechnicalMemoReferences): { content: string; citationMatches: DeclaredCitationMatch[]; missingDataNotes: readonly string[] } {
    let json: unknown;
    try {
      json = JSON.parse(rawContent);
    } catch {
      throw new Error("response is not valid JSON");
    }

    const result = TechnicalMemoSectionResponseSchema.safeParse(json);
    if (!result.success) {
      throw new Error(`response does not match the expected schema: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
    }

    const validatedReferences = validateTechnicalMemoCitations(result.data.citations, knownReferences);
    const citationMatches = validatedReferences.map((reference, index) => ({ reference, excerpt: result.data.citations[index]?.excerpt }));

    return { content: result.data.content, citationMatches, missingDataNotes: result.data.missingDataNotes };
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

  private toFailureOutcome(error: unknown): GenerationOutcome {
    const reason = error instanceof Error ? error.message : String(error);
    this.logger.error(`Technical memo section generation failed: ${reason}`);
    return { kind: "failed", errorMessage: reason };
  }

  /** Finalisation (révision + citations + section) — seconde transaction courte.
   *
   *  Correctif audit (même classe de bug que P1-FIXC-001, GO/NO-GO) — `lockSection` est repris ICI,
   *  jamais seulement dans `beginGeneration()` : le verrou consultatif Postgres est scopé à la
   *  TRANSACTION (`pg_advisory_xact_lock`), donc relâché dès que la transaction de
   *  `beginGeneration()` committe, bien AVANT que cette méthode ne lise/écrive
   *  `nextRevisionNumber`/`create`. Sans ce second verrou, deux finalisations concurrentes de la
   *  MÊME section (deux régénérations, ou une régénération + une édition manuelle) pouvaient courir
   *  sur `nextRevisionNumber` sans aucune sérialisation réelle (mission §43/§47 "réutiliser les
   *  mécanismes de lock existants, éviter un read-max-write non protégé"). */
  private async finalize(command: GenerateTechnicalMemoSectionCommand, outcome: GenerationOutcome): Promise<TechnicalMemoSectionRevision> {
    return this.atomicTransactionRunner.run(async () => {
      await this.revisionRepository.lockSection({ organizationId: command.organizationId, technicalMemoSectionId: command.technicalMemoSectionId });

      const section = await this.sectionRepository.findById({ organizationId: command.organizationId, technicalMemoSectionId: command.technicalMemoSectionId });
      if (!section) {
        throw new TechnicalMemoSectionNotFoundError();
      }
      const occurredAt = this.clock.now();

      if (outcome.kind === "failed") {
        section.markFailed(occurredAt);
        await this.sectionRepository.save(section);
        await this.auditLogWriter.record({
          organizationId: command.organizationId,
          actorType: "USER",
          actorId: command.actorId,
          action: "technical_memo.section_generation_failed",
          resourceType: "technical_memo_section",
          resourceId: section.id,
          requestId: command.requestId,
          metadata: { errorMessage: outcome.errorMessage },
        });
        throw new Error(outcome.errorMessage);
      }

      const revisionNumber = await this.revisionRepository.nextRevisionNumber({ organizationId: command.organizationId, technicalMemoSectionId: command.technicalMemoSectionId });
      const revisionId = this.idGenerator.generate();
      const citations = outcome.citationMatches.map(({ reference, excerpt }) =>
        TechnicalMemoSectionCitation.create({
          id: this.idGenerator.generate(),
          organizationId: command.organizationId,
          technicalMemoSectionRevisionId: revisionId,
          sourceType: reference.sourceType,
          findingType: reference.findingType,
          findingId: reference.findingId,
          knowledgeEntryId: reference.knowledgeEntryId,
          knowledgeEntryVersionId: reference.knowledgeEntryVersionId,
          companyReferenceId: reference.companyReferenceId,
          candidateFieldPath: reference.candidateFieldPath,
          documentId: reference.documentId,
          chunkSequence: reference.chunkSequence,
          pageStart: reference.pageStart,
          pageEnd: reference.pageEnd,
          label: reference.label,
          excerpt: excerpt ?? reference.content.slice(0, 500),
          occurredAt,
        }),
      );

      const revision = TechnicalMemoSectionRevision.create({
        id: revisionId,
        organizationId: command.organizationId,
        technicalMemoSectionId: command.technicalMemoSectionId,
        revisionNumber,
        source: revisionNumber === 1 ? TechnicalMemoSectionRevisionSource.AiGenerated : TechnicalMemoSectionRevisionSource.AiRegenerated,
        content: outcome.content,
        userInstruction: command.userInstruction,
        aiModel: outcome.model,
        promptVersion: TECHNICAL_MEMO_SYSTEM_PROMPT_VERSION,
        inputTokenCount: outcome.usage.inputTokens,
        outputTokenCount: outcome.usage.outputTokens,
        totalTokenCount: outcome.usage.totalTokens,
        missingDataNotes: outcome.missingDataNotes,
        citations,
        candidateCompanyId: outcome.candidateCompanyId,
        analysisVersion: outcome.analysisVersion,
        dceRevision: outcome.dceRevision,
        createdBy: command.actorId,
        occurredAt,
      });
      await this.revisionRepository.create({ revision, citations });

      section.applyRevision({ content: outcome.content, hasMissingData: outcome.missingDataNotes.length > 0, occurredAt });
      await this.sectionRepository.save(section);

      // Mission §43-47 — suggestion de couverture fondée sur une PREUVE réelle (les citations de
      // TYPE Finding de la révision qui vient d'être validée), jamais une similarité vectorielle ou
      // un score inventé : une exigence liée que le modèle a effectivement citée en rédigeant cette
      // section est COVERED ; sinon elle reste NEEDS_REVIEW (jamais NOT_COVERED tranché seul par
      // l'IA, mission §47). Une correction déjà confirmée par l'utilisateur (`confirmedByUser`)
      // n'est jamais écrasée (voir `TechnicalMemoSectionRequirement.suggestCoverage`).
      const citedFindingKeys = new Set(citations.filter((c) => c.findingType && c.findingId).map((c) => `${c.findingType}:${c.findingId}`));
      const requirementLinks = await this.requirementRepository.listBySectionId({ organizationId: command.organizationId, technicalMemoSectionId: section.id });
      for (const link of requirementLinks) {
        const isCited = citedFindingKeys.has(`${link.findingType}:${link.findingId}`);
        link.suggestCoverage({
          coverageStatus: isCited ? TechnicalMemoCoverageStatus.Covered : TechnicalMemoCoverageStatus.NeedsReview,
          coverageReason: isCited ? "Cité explicitement par l'IA dans le contenu généré de cette section." : undefined,
          occurredAt,
        });
        await this.requirementRepository.save(link);
      }

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorType: "USER",
        actorId: command.actorId,
        action: revisionNumber === 1 ? "technical_memo.section_generated" : "technical_memo.section_regenerated",
        resourceType: "technical_memo_section",
        resourceId: section.id,
        requestId: command.requestId,
        metadata: { revisionNumber, citationCount: citations.length, missingDataCount: outcome.missingDataNotes.length },
      });

      return revision;
    });
  }
}
