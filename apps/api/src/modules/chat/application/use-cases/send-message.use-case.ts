import { Inject, Injectable, Logger } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import {
  AI_PROVIDER_REGISTRY,
  AiTimeoutError,
  type AIProvider,
  type AIProviderRegistry,
  type AIProviderRequest,
  type AIProviderResult,
} from "../../../analysis";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { assertHasTenderPermission, GetTenderUseCase, TenderPermission, type TenderSummary } from "../../../tenders";
import { validateChatCitations, type KnownChatReferences } from "../../domain/chat-citation-validator";
import { ChatRateLimitReachedError, ConversationArchivedError, ConversationGenerationInProgressError, ConversationNotFoundError } from "../../domain/errors";
import { MessageCitation } from "../../domain/message-citation.entity";
import { Message, MessageRole, MessageStatus } from "../../domain/message.entity";
import { CHAT_CONFIG, type ChatConfig } from "../../infrastructure/chat-config";
import { buildChatSystemPrompt, CHAT_SYSTEM_PROMPT_VERSION } from "../../infrastructure/chat-system-prompt";
import { toMessageSummary, type MessageSummary } from "../dtos";
import { assertChatAccess } from "../policies/chat-authorization.policy";
import { isRetryableAiError } from "../policies/ai-error-classification";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { CONVERSATION_REPOSITORY, type ConversationRepository } from "../ports/conversation.repository";
import { MESSAGE_REPOSITORY, type MessageRepository } from "../ports/message.repository";
import { OUTBOX_WRITER, type OutboxEventInput, type OutboxWriter } from "../../../outbox";
import { ChatContextAssembler } from "../services/chat-context-assembler";
import { ChatResponseOutputSchema } from "../services/chat-response-schema";

export type SendMessageCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  conversationId: string;
  actorId: string;
  actorRole: string;
  content: string;
  requestId?: string | undefined;
}>;

const HISTORY_MESSAGE_LIMIT = 10;
const MAX_ANSWER_OUTPUT_TOKENS = 1_500;
const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type GenerationOutcome =
  | { kind: "completed"; content: string; model: string; citations: readonly MessageCitation[]; usage: AIProviderResult["usage"] }
  /** `model` renseigné SEULEMENT si un appel provider a réellement été tenté avant cet échec (voir
   *  `Message.fail`) — jamais pour un échec survenu avant tout appel réseau (résolution du
   *  provider). */
  | { kind: "failed"; errorMessage: string; model?: string | undefined };

/**
 * Orchestrateur principal du Chat (mission décision §1 — synchrone, un seul aller-retour HTTP,
 * jamais de streaming ce sprint) :
 * 1. Garde anti-abus + création du message USER + placeholder ASSISTANT `PENDING` dans une
 *    transaction courte (mission décision §4).
 * 2. Assemblage du contexte + appel provider IA HORS transaction (jamais un appel réseau dans une
 *    transaction Prisma, même discipline que `ProcessGenerationUseCase`).
 * 3. Validation stricte du schéma structuré ET de chaque citation contre le contexte RÉELLEMENT
 *    fourni (jamais une confiance auto-déclarée par le modèle) — une sortie invalide fait échouer le
 *    message, jamais persisté comme une réponse valide.
 * 4. Finalisation (COMPLETED/FAILED) + citations + audit + Outbox dans une seconde transaction
 *    courte.
 */
@Injectable()
export class SendMessageUseCase {
  private readonly logger = new Logger(SendMessageUseCase.name);

  constructor(
    @Inject(CONVERSATION_REPOSITORY) private readonly conversationRepository: ConversationRepository,
    @Inject(MESSAGE_REPOSITORY) private readonly messageRepository: MessageRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    @Inject(AI_PROVIDER_REGISTRY) private readonly providerRegistry: AIProviderRegistry,
    @Inject(CHAT_CONFIG) private readonly config: ChatConfig,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly contextAssembler: ChatContextAssembler,
  ) {}

  async execute(command: SendMessageCommand): Promise<MessageSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.UseChat);
    const tender = await assertChatAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.UseChat,
    });

    const conversation = await this.conversationRepository.findById({ organizationId: command.organizationId, conversationId: command.conversationId });
    if (!conversation || conversation.tenderId !== command.tenderId) {
      throw new ConversationNotFoundError();
    }
    if (conversation.isArchived) {
      throw new ConversationArchivedError();
    }

    const priorMessages = await this.messageRepository.listByConversation({ organizationId: command.organizationId, conversationId: command.conversationId });

    const pendingAssistant = await this.atomicTransactionRunner.run(async () => {
      const occurredAt = this.clock.now();

      // Correctif audit Codex P1, round 2 (garde-fou volume IA, décision utilisateur) — verrou
      // consultatif AVANT le comptage : aucune requête concurrente sur le même Tender ne peut
      // constater "sous le plafond" avant qu'une autre n'ait committé sa propre RÉSERVATION.
      // `countBillableAssistantMessagesForTenderSince` compte désormais aussi les messages PENDING
      // (voir le port) — le comptage seul ne suffisait pas : entre la création d'un message PENDING
      // et sa résolution (COMPLETED/FAILED), il restait invisible au comptage, laissant passer
      // autant de requêtes concurrentes que de conversations différentes du même Tender tant
      // qu'aucune n'était encore complétée. Vérifié AVANT tout appel provider, jamais après
      // (mission "ne jamais appeler OpenAI après dépassement") — et la RÉSERVATION elle-même (la
      // création du message PENDING ci-dessous) reste DANS LA MÊME transaction verrouillée, donc
      // visible par construction à la toute prochaine requête concurrente sur ce Tender.
      await this.messageRepository.lockTenderQuota({ organizationId: command.organizationId, tenderId: command.tenderId });
      const billableCount = await this.messageRepository.countBillableAssistantMessagesForTenderSince({
        organizationId: command.organizationId,
        tenderId: command.tenderId,
        since: new Date(occurredAt.getTime() - QUOTA_WINDOW_MS),
      });
      if (billableCount >= this.config.maxAiCallsPerTenderPerDay) {
        throw new ChatRateLimitReachedError();
      }

      const existingPending = await this.messageRepository.findPendingByConversation({ organizationId: command.organizationId, conversationId: command.conversationId });
      if (existingPending) {
        throw new ConversationGenerationInProgressError();
      }

      const userMessage = Message.createUserMessage({
        id: this.idGenerator.generate(),
        organizationId: command.organizationId,
        conversationId: command.conversationId,
        content: command.content,
        createdByUserId: command.actorId,
        occurredAt,
      });
      await this.messageRepository.save(userMessage);

      const pendingAssistant = Message.createPendingAssistantMessage({
        id: this.idGenerator.generate(),
        organizationId: command.organizationId,
        conversationId: command.conversationId,
        occurredAt,
      });
      await this.messageRepository.save(pendingAssistant);

      conversation.touch(occurredAt);
      await this.conversationRepository.save(conversation);

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "chat.ai_chat_requested",
        resourceType: "message",
        resourceId: pendingAssistant.id,
        requestId: command.requestId,
        metadata: { conversationId: command.conversationId, tenderId: command.tenderId },
      });

      return pendingAssistant;
    });

    const outcome = await this.generate({ command, tender, priorMessages, assistantMessageId: pendingAssistant.id });

    await this.atomicTransactionRunner.run(async () => {
      const occurredAt = this.clock.now();
      if (outcome.kind === "completed") {
        pendingAssistant.complete({ content: outcome.content, model: outcome.model, promptVersion: CHAT_SYSTEM_PROMPT_VERSION, usage: { inputTokenCount: outcome.usage.inputTokens, outputTokenCount: outcome.usage.outputTokens, totalTokenCount: outcome.usage.totalTokens } });
        await this.messageRepository.save(pendingAssistant);
        if (outcome.citations.length > 0) {
          await this.messageRepository.saveCitations(outcome.citations);
        }

        await this.auditLogWriter.record({
          organizationId: command.organizationId,
          actorId: command.actorId,
          action: "chat.ai_chat_completed",
          resourceType: "message",
          resourceId: pendingAssistant.id,
          requestId: command.requestId,
          metadata: { conversationId: command.conversationId, citationCount: outcome.citations.length },
        });

        const events: OutboxEventInput[] = [
          { eventType: "AiResponseCompleted", aggregateType: "Message", aggregateId: pendingAssistant.id, payload: { conversationId: command.conversationId }, occurredAt },
        ];
        await this.outboxWriter.write({ organizationId: command.organizationId, events });
      } else {
        pendingAssistant.fail(outcome.errorMessage, outcome.model);
        await this.messageRepository.save(pendingAssistant);

        await this.auditLogWriter.record({
          organizationId: command.organizationId,
          actorId: command.actorId,
          action: "chat.ai_chat_failed",
          resourceType: "message",
          resourceId: pendingAssistant.id,
          requestId: command.requestId,
          metadata: { conversationId: command.conversationId, errorMessage: outcome.errorMessage },
        });

        const events: OutboxEventInput[] = [
          { eventType: "AiResponseFailed", aggregateType: "Message", aggregateId: pendingAssistant.id, payload: { conversationId: command.conversationId }, occurredAt },
        ];
        await this.outboxWriter.write({ organizationId: command.organizationId, events });
      }
    });

    const citations = outcome.kind === "completed" ? outcome.citations : [];
    return toMessageSummary(pendingAssistant, citations);
  }

  /** Intégralement hors transaction Prisma — même discipline que
   *  `ProcessGenerationUseCase.runPhase2` : assemblage du contexte, appel provider avec timeout/
   *  retry bornés, validation stricte (schéma + citations). */
  private async generate(input: {
    command: SendMessageCommand;
    tender: TenderSummary;
    priorMessages: readonly Message[];
    assistantMessageId: string;
  }): Promise<GenerationOutcome> {
    let provider: AIProvider;
    try {
      provider = this.providerRegistry.resolve(this.config.aiProvider ? { provider: this.config.aiProvider } : undefined);
    } catch (error) {
      return this.toFailureOutcome(error);
    }

    const context = await this.contextAssembler.assemble({
      organizationId: input.command.organizationId,
      tenderId: input.command.tenderId,
      actorId: input.command.actorId,
      actorRole: input.command.actorRole,
      tender: input.tender,
      question: input.command.content,
    });

    const historyBlock = this.buildHistoryBlock(input.priorMessages);
    const userPrompt = `### HISTORIQUE\n${historyBlock}\n\n### CONTEXTE\n${context.contextBlock}\n\n### QUESTION\n${input.command.content}`;

    const maxAttempts = 1 + this.config.aiMaxRetries;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.callWithTimeout(provider, {
          model: this.config.aiModel,
          systemPrompt: buildChatSystemPrompt(),
          userPrompt,
          responseSchemaName: "CHAT_RESPONSE",
          maxOutputTokens: MAX_ANSWER_OUTPUT_TOKENS,
          timeoutMs: this.config.aiTimeoutMs,
        });

        const citations = this.parseAndValidate(result.content, context.knownReferences, input.command, input.assistantMessageId);
        return { kind: "completed", content: JSON.parse(result.content).answer as string, model: this.config.aiModel, citations, usage: result.usage };
      } catch (error) {
        const isLastAttempt = attempt === maxAttempts;
        if (!isRetryableAiError(error) || isLastAttempt) {
          // Un appel provider a été RÉELLEMENT tenté (au moins cette itération) — facturable au
          // sens du garde-fou volume IA, que l'échec vienne du réseau ou de la validation
          // sortie/citations APRÈS une réponse effectivement reçue (voir `Message.fail`).
          return this.toFailureOutcome(error, this.config.aiModel);
        }
        this.logger.warn(`AI provider call failed (retryable) for conversation ${input.command.conversationId}, attempt ${attempt}/${maxAttempts}: ${error instanceof Error ? error.message : String(error)}`);
        await sleep(this.config.aiRetryDelayMs * attempt);
      }
    }

    return this.toFailureOutcome(new AiTimeoutError({ timeoutMs: this.config.aiTimeoutMs }), this.config.aiModel);
  }

  private buildHistoryBlock(priorMessages: readonly Message[]): string {
    const relevant = priorMessages.filter((message) => message.status === MessageStatus.Completed).slice(-HISTORY_MESSAGE_LIMIT);
    if (relevant.length === 0) return "(aucun échange précédent dans cette conversation)";
    return relevant.map((message) => `${message.role === MessageRole.User ? "Utilisateur" : "Assistant"} : ${message.content}`).join("\n");
  }

  /** JSON.parse + validation Zod hors transaction — une sortie invalide n'est JAMAIS persistée comme
   *  message ASSISTANT valide (mission §"anti-hallucination"). Les citations sont vérifiées contre le
   *  contexte RÉELLEMENT fourni, jamais une confiance auto-déclarée par le modèle. */
  private parseAndValidate(rawContent: string, knownReferences: KnownChatReferences, command: SendMessageCommand, assistantMessageId: string): MessageCitation[] {
    let json: unknown;
    try {
      json = JSON.parse(rawContent);
    } catch {
      throw new Error("response is not valid JSON");
    }

    const result = ChatResponseOutputSchema.safeParse(json);
    if (!result.success) {
      throw new Error(`response does not match the expected schema: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
    }

    const validatedReferences = validateChatCitations(result.data.citations, knownReferences);
    const occurredAt = this.clock.now();
    return validatedReferences.map((reference, index) =>
      MessageCitation.create({
        id: this.idGenerator.generate(),
        organizationId: command.organizationId,
        messageId: assistantMessageId,
        sourceType: reference.sourceType,
        documentId: reference.documentId,
        documentVersionId: reference.documentVersionId,
        chunkSequence: reference.chunkSequence,
        pageStart: reference.pageStart,
        pageEnd: reference.pageEnd,
        sheetName: reference.sheetName,
        sectionTitle: reference.sectionTitle,
        knowledgeEntryId: reference.knowledgeEntryId,
        knowledgeEntryVersionId: reference.knowledgeEntryVersionId,
        checklistItemId: reference.checklistItemId,
        findingType: reference.findingType,
        findingId: reference.findingId,
        label: reference.label,
        excerpt: result.data.citations[index]?.excerpt ?? reference.content.slice(0, 500),
        occurredAt,
      }),
    );
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

  private toFailureOutcome(error: unknown, model?: string): GenerationOutcome {
    const reason = error instanceof Error ? error.message : String(error);
    this.logger.error(`Chat generation failed: ${reason}`);
    return { kind: "failed", errorMessage: reason, model };
  }
}
