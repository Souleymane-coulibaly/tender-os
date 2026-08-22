import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiModelRouter } from "../../../ai-routing";
import { InMemoryAiModelPreferenceRepository } from "../../../ai-routing/test-support/fakes";
import type { GetTenderUseCase } from "../../../tenders";
import { TenderPermissionMissingError } from "../../../tenders";
import { ChatRateLimitReachedError, ConversationArchivedError, ConversationGenerationInProgressError, ConversationNotFoundError } from "../../domain/errors";
import { Conversation } from "../../domain/conversation.entity";
import { CitationSourceType } from "../../domain/message-citation.entity";
import { Message, MessageStatus } from "../../domain/message.entity";
import {
  FakeAIProvider,
  FakeAIProviderRegistry,
  FakeAtomicTransactionRunner,
  FakeOutboxWriter,
  fakeChatAIProviderResult,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryConversationRepository,
  InMemoryMessageRepository,
  RecordingRoutingDecisionWriter,
  SequentialIdGenerator,
  ThrowingRoutingDecisionWriter,
} from "../../test-support/fakes";
import type { ChatContextAssembler } from "../services/chat-context-assembler";
import { SendMessageUseCase } from "./send-message.use-case";

const CHAT_CONFIG_FIXTURE = { aiModel: "gpt-4o-mini", aiTimeoutMs: 5000, aiMaxRetries: 1, aiRetryDelayMs: 1, maxAiCallsPerTenderPerDay: 100 };

describe("SendMessageUseCase", () => {
  let conversationRepository: InMemoryConversationRepository;
  let messageRepository: InMemoryMessageRepository;
  let getTenderUseCase: { execute: ReturnType<typeof vi.fn> };
  let assertClientAccessUseCase: { execute: ReturnType<typeof vi.fn> };
  let contextAssembler: { assemble: ReturnType<typeof vi.fn> };
  let outboxWriter: FakeOutboxWriter;
  let auditLogWriter: InMemoryAuditLogWriter;

  let clock: FixedClock;

  // Checkpoint TENDEROS-2.1-P2.3-E4.1 — un `AiModelRouter` réel (jamais `undefined`) est câblé par
  // défaut, comme en production (`AiRoutingModule` toujours câblé globalement) : les tests qui ne
  // testent pas spécifiquement le routing exercent donc le vrai chemin AUTOMATIC → gpt-5.4-mini.
  // Passer explicitement `null` simule l'absence de Router (cas défensif `@Optional()`, jamais le
  // cas réel en production) pour prouver l'échec propre (`AiModelRouterUnavailableError`).
  function buildUseCase(
    provider: FakeAIProvider,
    config: Partial<typeof CHAT_CONFIG_FIXTURE> = {},
    routingDecisionWriter?: RecordingRoutingDecisionWriter | ThrowingRoutingDecisionWriter,
    aiModelRouter: AiModelRouter | null = new AiModelRouter(new InMemoryAiModelPreferenceRepository()),
  ): SendMessageUseCase {
    outboxWriter = new FakeOutboxWriter();
    auditLogWriter = new InMemoryAuditLogWriter();
    return new SendMessageUseCase(
      conversationRepository,
      messageRepository,
      auditLogWriter,
      outboxWriter as never,
      clock,
      new SequentialIdGenerator(),
      new FakeAtomicTransactionRunner(),
      new FakeAIProviderRegistry(provider),
      { ...CHAT_CONFIG_FIXTURE, ...config } as never,
      getTenderUseCase as unknown as GetTenderUseCase,
      assertClientAccessUseCase as never,
      contextAssembler as unknown as ChatContextAssembler,
      routingDecisionWriter as never,
      aiModelRouter ?? undefined,
    );
  }

  beforeEach(() => {
    clock = new FixedClock();
    conversationRepository = new InMemoryConversationRepository();
    messageRepository = new InMemoryMessageRepository(conversationRepository);
    getTenderUseCase = { execute: vi.fn(async () => ({ id: "tender-1", clientAccountId: "client-1" })) };
    assertClientAccessUseCase = { execute: vi.fn(async () => {}) };
    contextAssembler = {
      assemble: vi.fn(async () => ({
        contextBlock: "## DONNÉES STRUCTURÉES\n- [TENDER:submissionDeadline] Date limite : 2026-09-01",
        knownReferences: new Map([["TENDER:submissionDeadline", { sourceType: CitationSourceType.TenderField, label: "Date limite", content: "Date limite de remise des plis : 2026-09-01" }]]),
      })),
    };
    conversationRepository.conversations.push(
      Conversation.create({ id: "conv-1", organizationId: "org-1", tenderId: "tender-1", clientAccountId: "client-1", createdByUserId: "user-1", occurredAt: new Date() }),
    );
  });

  it("completes the assistant message with citations validated against the actually supplied context", async () => {
    const provider = new FakeAIProvider([
      { kind: "success", result: fakeChatAIProviderResult({ content: JSON.stringify({ answer: "La date limite est le 1er septembre 2026.", citations: [{ sourceRef: "TENDER:submissionDeadline" }], insufficientContext: false }) }) },
    ]);
    const useCase = buildUseCase(provider);

    const result = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", conversationId: "conv-1", actorId: "user-1", actorRole: "BID_MANAGER", content: "Quelle est la date limite ?" });

    expect(result.status).toBe(MessageStatus.Completed);
    expect(result.content).toBe("La date limite est le 1er septembre 2026.");
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]?.sourceType).toBe(CitationSourceType.TenderField);
    // Le message USER et le message ASSISTANT ont bien été persistés.
    expect(messageRepository.messages.filter((m) => m.conversationId === "conv-1")).toHaveLength(2);
  });

  it("V2 Sprint 22 (billing, étape 22E) — emits ChatMessageSent on completion (jamais sur une lecture, toujours au point d'écriture réel)", async () => {
    const provider = new FakeAIProvider([
      { kind: "success", result: fakeChatAIProviderResult({ content: JSON.stringify({ answer: "La date limite est le 1er septembre 2026.", citations: [{ sourceRef: "TENDER:submissionDeadline" }], insufficientContext: false }) }) },
    ]);
    const useCase = buildUseCase(provider);

    await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", conversationId: "conv-1", actorId: "user-1", actorRole: "BID_MANAGER", content: "Quelle est la date limite ?" });

    expect(outboxWriter.events.map((e) => e.eventType)).toEqual(expect.arrayContaining(["AiResponseCompleted", "ChatMessageSent"]));
  });

  it("NEVER persists a forged citation (sourceRef not part of the supplied context) as a valid message — fails the message instead", async () => {
    const provider = new FakeAIProvider([
      { kind: "success", result: fakeChatAIProviderResult({ content: JSON.stringify({ answer: "Réponse avec source inventée.", citations: [{ sourceRef: "KB:forged-entry" }], insufficientContext: false }) }) },
    ]);
    const useCase = buildUseCase(provider);

    const result = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", conversationId: "conv-1", actorId: "user-1", actorRole: "BID_MANAGER", content: "Quelle est la date limite ?" });

    expect(result.status).toBe(MessageStatus.Failed);
    expect(result.citations).toHaveLength(0);
    expect(messageRepository.citations).toHaveLength(0);
  });

  it("refuses a second message while one is already PENDING for the same conversation (anti-abuse guard, mission decision §4)", async () => {
    messageRepository.messages.push(Message.createPendingAssistantMessage({ id: "existing-pending", organizationId: "org-1", conversationId: "conv-1", occurredAt: new Date() }));
    const provider = new FakeAIProvider([]);
    const useCase = buildUseCase(provider);

    await expect(useCase.execute({ organizationId: "org-1", tenderId: "tender-1", conversationId: "conv-1", actorId: "user-1", actorRole: "BID_MANAGER", content: "Une autre question ?" })).rejects.toBeInstanceOf(
      ConversationGenerationInProgressError,
    );
    // Aucun nouveau message USER n'a été créé — la garde s'applique AVANT toute écriture.
    expect(messageRepository.messages).toHaveLength(1);
    expect(provider.requests).toHaveLength(0);
  });

  it("refuses to send a message on an archived conversation", async () => {
    conversationRepository.conversations[0]!.archive(new Date());
    const useCase = buildUseCase(new FakeAIProvider([]));

    await expect(useCase.execute({ organizationId: "org-1", tenderId: "tender-1", conversationId: "conv-1", actorId: "user-1", actorRole: "BID_MANAGER", content: "Question ?" })).rejects.toBeInstanceOf(ConversationArchivedError);
    expect(messageRepository.messages).toHaveLength(0);
  });

  it("rejects a conversation belonging to a different Tender (anti-IDOR)", async () => {
    const useCase = buildUseCase(new FakeAIProvider([]));
    await expect(useCase.execute({ organizationId: "org-1", tenderId: "tender-OTHER", conversationId: "conv-1", actorId: "user-1", actorRole: "BID_MANAGER", content: "Question ?" })).rejects.toBeInstanceOf(ConversationNotFoundError);
  });

  it("rejects a role without TenderPermission.UseChat before touching any repository", async () => {
    const useCase = buildUseCase(new FakeAIProvider([]));
    await expect(useCase.execute({ organizationId: "org-1", tenderId: "tender-1", conversationId: "conv-1", actorId: "user-1", actorRole: "READ_ONLY", content: "Question ?" })).rejects.toBeInstanceOf(TenderPermissionMissingError);
    expect(messageRepository.messages).toHaveLength(0);
  });

  it("marks the message FAILED (never throws to the caller) when the AI provider is unavailable, and records the failure via audit/outbox", async () => {
    const provider = new FakeAIProvider([{ kind: "error", error: new Error("network error while calling the AI provider") }]);
    const useCase = buildUseCase(provider);

    const result = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", conversationId: "conv-1", actorId: "user-1", actorRole: "BID_MANAGER", content: "Question ?" });

    expect(result.status).toBe(MessageStatus.Failed);
    expect(result.errorMessage).toBeTruthy();
    expect(auditLogWriter.entries.map((e) => e.action)).toEqual(expect.arrayContaining(["chat.ai_chat_requested", "chat.ai_chat_failed"]));
    // Correctif audit Codex P1 — un appel provider a été RÉELLEMENT tenté (échec réseau APRÈS
    // l'appel, jamais avant) : `model` doit être renseigné pour que ce message compte comme
    // "facturable" dans le garde-fou volume IA, contrairement à un échec de permission/résolution
    // provider (voir les tests dédiés ci-dessous).
    expect(messageRepository.messages.find((m) => m.status === MessageStatus.Failed)?.model).toBe("gpt-5.4-mini");
  });

  describe("garde-fou volume IA par Tender/jour (correctif audit Codex P1, décision utilisateur)", () => {
    /** Insère directement des messages ASSISTANT COMPLETED (sans passer par le use case) pour
     *  simuler une consommation déjà acquise — même motif que les autres tests de cette suite qui
     *  poussent des fixtures directement dans les repositories en mémoire. */
    function seedBillableMessages(count: number, createdAt: Date, conversationId = "conv-1"): void {
      for (let i = 0; i < count; i++) {
        const message = Message.createPendingAssistantMessage({ id: `seed-${conversationId}-${createdAt.getTime()}-${i}`, organizationId: "org-1", conversationId, occurredAt: createdAt });
        message.complete({ content: "réponse précédente", model: "gpt-4o-mini", promptVersion: 1, usage: { inputTokenCount: 1, outputTokenCount: 1, totalTokenCount: 2 } });
        messageRepository.messages.push(message);
      }
    }

    function successProvider(): FakeAIProvider {
      return new FakeAIProvider([{ kind: "success", result: fakeChatAIProviderResult({ content: JSON.stringify({ answer: "Réponse.", citations: [], insufficientContext: false }) }) }]);
    }

    it("allows the call when exactly cap-1 billable messages already exist for this Tender today", async () => {
      seedBillableMessages(1, clock.now());
      const useCase = buildUseCase(successProvider(), { maxAiCallsPerTenderPerDay: 2 });

      const result = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", conversationId: "conv-1", actorId: "user-1", actorRole: "BID_MANAGER", content: "Question ?" });

      expect(result.status).toBe(MessageStatus.Completed);
    });

    it("refuses the call once the cap is reached — NEVER calls the AI provider beyond the limit", async () => {
      seedBillableMessages(2, clock.now());
      const provider = successProvider();
      const useCase = buildUseCase(provider, { maxAiCallsPerTenderPerDay: 2 });

      await expect(useCase.execute({ organizationId: "org-1", tenderId: "tender-1", conversationId: "conv-1", actorId: "user-1", actorRole: "BID_MANAGER", content: "Question ?" })).rejects.toBeInstanceOf(
        ChatRateLimitReachedError,
      );
      expect(provider.requests).toHaveLength(0);
      // La garde s'applique AVANT toute écriture — aucun nouveau message USER/ASSISTANT créé.
      expect(messageRepository.messages.filter((m) => !m.id.startsWith("seed-"))).toHaveLength(0);
    });

    it("correctif audit Codex round 2 P1 — a message left PENDING by another in-flight conversation of the SAME Tender counts toward the cap immediately (never waits for it to complete)", async () => {
      conversationRepository.conversations.push(
        Conversation.create({ id: "conv-in-flight", organizationId: "org-1", tenderId: "tender-1", clientAccountId: "client-1", createdByUserId: "user-1", occurredAt: clock.now() }),
      );
      // Une conversation DIFFÉRENTE du même Tender a une génération EN COURS (jamais résolue) —
      // exactement le trou que le premier correctif laissait passer : le comptage ne voyait QUE
      // COMPLETED/FAILED, jamais PENDING.
      messageRepository.messages.push(Message.createPendingAssistantMessage({ id: "in-flight-pending", organizationId: "org-1", conversationId: "conv-in-flight", occurredAt: clock.now() }));
      const provider = successProvider();
      const useCase = buildUseCase(provider, { maxAiCallsPerTenderPerDay: 1 });

      await expect(useCase.execute({ organizationId: "org-1", tenderId: "tender-1", conversationId: "conv-1", actorId: "user-1", actorRole: "BID_MANAGER", content: "Question ?" })).rejects.toBeInstanceOf(
        ChatRateLimitReachedError,
      );
      expect(provider.requests).toHaveLength(0);
    });

    it("counts each Tender independently — a full quota on another Tender never blocks this one", async () => {
      conversationRepository.conversations.push(Conversation.create({ id: "conv-other-tender", organizationId: "org-1", tenderId: "tender-OTHER", clientAccountId: "client-1", createdByUserId: "user-1", occurredAt: clock.now() }));
      seedBillableMessages(5, clock.now(), "conv-other-tender");
      const useCase = buildUseCase(successProvider(), { maxAiCallsPerTenderPerDay: 2 });

      const result = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", conversationId: "conv-1", actorId: "user-1", actorRole: "BID_MANAGER", content: "Question ?" });

      expect(result.status).toBe(MessageStatus.Completed);
    });

    it("resets on a rolling 24h window — a message older than 24h no longer counts against the cap", async () => {
      const twentyFiveHoursAgo = new Date(clock.now().getTime() - 25 * 60 * 60 * 1000);
      seedBillableMessages(2, twentyFiveHoursAgo);
      const useCase = buildUseCase(successProvider(), { maxAiCallsPerTenderPerDay: 2 });

      const result = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", conversationId: "conv-1", actorId: "user-1", actorRole: "BID_MANAGER", content: "Question ?" });

      expect(result.status).toBe(MessageStatus.Completed);
    });

    it("never counts a FAILED message that never actually reached the AI provider (no model recorded) — a pre-call failure is free", async () => {
      const failedBeforeCall = Message.createPendingAssistantMessage({ id: "seed-free-fail", organizationId: "org-1", conversationId: "conv-1", occurredAt: clock.now() });
      failedBeforeCall.fail("permission denied before any provider call"); // pas de `model` — jamais facturable.
      messageRepository.messages.push(failedBeforeCall);
      seedBillableMessages(2, clock.now());
      const useCase = buildUseCase(successProvider(), { maxAiCallsPerTenderPerDay: 2 });

      // 2 messages FACTURABLES seedés (au plafond) + 1 gratuit non compté : doit tout de même
      // refuser, car le plafond de 2 facturables est déjà atteint — preuve que le message gratuit
      // n'a ni aidé ni nui au calcul, il est simplement ignoré.
      await expect(useCase.execute({ organizationId: "org-1", tenderId: "tender-1", conversationId: "conv-1", actorId: "user-1", actorRole: "BID_MANAGER", content: "Question ?" })).rejects.toBeInstanceOf(
        ChatRateLimitReachedError,
      );
    });

    it("never calls the AI provider once the cap is already reached, even when the failing attempt would otherwise have been retried", async () => {
      seedBillableMessages(2, clock.now());
      const provider = new FakeAIProvider([{ kind: "error", error: new Error("should never be called") }]);
      const useCase = buildUseCase(provider, { maxAiCallsPerTenderPerDay: 2 });

      await expect(useCase.execute({ organizationId: "org-1", tenderId: "tender-1", conversationId: "conv-1", actorId: "user-1", actorRole: "BID_MANAGER", content: "Question ?" })).rejects.toBeInstanceOf(
        ChatRateLimitReachedError,
      );
      expect(provider.requests).toHaveLength(0);
    });
  });

  describe("Checkpoint TENDEROS-2.1-P2.3-E4.1 — AiModelRouter est la SEULE autorité de sélection du modèle", () => {
    function successProvider(): FakeAIProvider {
      return new FakeAIProvider([{ kind: "success", result: fakeChatAIProviderResult({ content: JSON.stringify({ answer: "Réponse.", citations: [], insufficientContext: false }) }) }]);
    }

    it("mission §34 TEST_DEFAULT_MINI — CHAT (real task type) resolves to gpt-5.4-mini via AUTOMATIC, no configuration required", async () => {
      const provider = successProvider();
      const aiModelRouter = new AiModelRouter(new InMemoryAiModelPreferenceRepository());
      const useCase = buildUseCase(provider, {}, undefined, aiModelRouter);

      const result = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", conversationId: "conv-1", actorId: "user-1", actorRole: "BID_MANAGER", content: "Question ?" });

      expect(result.status).toBe(MessageStatus.Completed);
      expect(provider.requests[0]?.model).toBe("gpt-5.4-mini");
    });

    it("passes the real actorId as userId to AiModelRouter.resolve (mission §18 — backend authoritative, override resolution keyed off the real actor, never client-supplied)", async () => {
      const preferenceRepository = new InMemoryAiModelPreferenceRepository();
      const aiModelRouter = new AiModelRouter(preferenceRepository);
      const resolveSpy = vi.spyOn(aiModelRouter, "resolve");
      const provider = successProvider();
      const useCase = buildUseCase(provider, {}, undefined, aiModelRouter);

      await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", conversationId: "conv-1", actorId: "user-42", actorRole: "BID_MANAGER", content: "Question ?" });

      expect(resolveSpy).toHaveBeenCalledWith({ taskType: "CHAT", organizationId: "org-1", userId: "user-42" });
    });

    it("BLOQUANT — no AiModelRouter wired (defensive @Optional() case, never true in production) — fails CLEANLY, never a silent fallback to a hardcoded model, provider is never called", async () => {
      const provider = successProvider();
      const useCase = buildUseCase(provider, {}, undefined, null);

      const result = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", conversationId: "conv-1", actorId: "user-1", actorRole: "BID_MANAGER", content: "Question ?" });

      expect(result.status).toBe(MessageStatus.Failed);
      expect(provider.requests).toHaveLength(0);
    });
  });

  describe("Consolidation IA — Checkpoint D (traçabilité des décisions de routing, best-effort)", () => {
    function successProvider(): FakeAIProvider {
      return new FakeAIProvider([{ kind: "success", result: fakeChatAIProviderResult({ content: JSON.stringify({ answer: "Réponse.", citations: [], insufficientContext: false }) }) }]);
    }

    it("BLOQUANT — no writer wired (undefined) — behaves exactly as before, never throws", async () => {
      const provider = successProvider();
      const useCase = buildUseCase(provider, {}, undefined);

      const result = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", conversationId: "conv-1", actorId: "user-1", actorRole: "BID_MANAGER", content: "Question ?" });

      expect(result.status).toBe(MessageStatus.Completed);
    });

    it("complete() is called exactly once on success, with the correct conversationId/promptKey/model", async () => {
      const provider = successProvider();
      const writer = new RecordingRoutingDecisionWriter();
      const useCase = buildUseCase(provider, {}, writer);

      const result = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", conversationId: "conv-1", actorId: "user-1", actorRole: "BID_MANAGER", content: "Question ?" });

      expect(result.status).toBe(MessageStatus.Completed);
      expect(writer.created).toHaveLength(1);
      expect(writer.created[0]).toMatchObject({ organizationId: "org-1", tenderId: "tender-1", conversationId: "conv-1", promptKey: "CHAT", primaryModel: "gpt-5.4-mini" });
      expect(writer.completed).toHaveLength(1);
      expect(writer.completed[0]).toMatchObject({ id: writer.created[0]?.id, selectedModel: "gpt-5.4-mini", status: "SUCCEEDED", fallbackLevel: 0, fallbackAttempts: 0 });
    });

    /**
     * Correctif audit P2 Checkpoint D — le test précédent prouve seulement que `create()`/`complete()`
     * sont bien APPELÉS, jamais que `create()` précède réellement l'appel provider dans le temps (ni
     * que `complete()` le suit). `vi.spyOn` sur les DEUX côtés (provider ET writer) partage le même
     * compteur global `invocationCallOrder` de vitest — comparer ces indices prouve l'ORDRE CHRONOLOGIQUE
     * réel des appels, jamais une simple co-occurrence de compteurs.
     */
    it("BLOQUANT — create() happens strictly BEFORE provider.complete(), which happens strictly BEFORE routingDecision.complete() — proven by invocation order, not just call counts", async () => {
      const provider = successProvider();
      const writer = new RecordingRoutingDecisionWriter();
      const providerCompleteSpy = vi.spyOn(provider, "complete");
      const createSpy = vi.spyOn(writer, "create");
      const completeSpy = vi.spyOn(writer, "complete");
      const useCase = buildUseCase(provider, {}, writer);

      await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", conversationId: "conv-1", actorId: "user-1", actorRole: "BID_MANAGER", content: "Question ?" });

      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(providerCompleteSpy).toHaveBeenCalledTimes(1);
      expect(completeSpy).toHaveBeenCalledTimes(1);
      expect(createSpy.mock.invocationCallOrder[0]).toBeLessThan(providerCompleteSpy.mock.invocationCallOrder[0]!);
      expect(providerCompleteSpy.mock.invocationCallOrder[0]).toBeLessThan(completeSpy.mock.invocationCallOrder[0]!);
    });

    it("BLOQUANT — complete() is called exactly once with status FAILED when the conversation ultimately fails", async () => {
      const provider = new FakeAIProvider([{ kind: "error", error: new Error("network error while calling the AI provider") }]);
      const writer = new RecordingRoutingDecisionWriter();
      const useCase = buildUseCase(provider, { aiMaxRetries: 0 }, writer);

      const result = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", conversationId: "conv-1", actorId: "user-1", actorRole: "BID_MANAGER", content: "Question ?" });

      expect(result.status).toBe(MessageStatus.Failed);
      expect(writer.created).toHaveLength(1);
      expect(writer.completed).toHaveLength(1);
      expect(writer.completed[0]?.status).toBe("FAILED");
    });

    it("BLOQUANT — a writer that throws on create()/complete() never fails an otherwise-successful conversation", async () => {
      const provider = successProvider();
      const writer = new ThrowingRoutingDecisionWriter();
      const useCase = buildUseCase(provider, {}, writer);

      const result = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", conversationId: "conv-1", actorId: "user-1", actorRole: "BID_MANAGER", content: "Question ?" });

      expect(result.status).toBe(MessageStatus.Completed);
      expect(result.content).toBe("Réponse.");
    });
  });
});
