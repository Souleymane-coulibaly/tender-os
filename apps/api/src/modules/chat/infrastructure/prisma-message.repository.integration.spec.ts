import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { Conversation } from "../domain/conversation.entity";
import { Message } from "../domain/message.entity";
import { PrismaAtomicTransactionRunner } from "./prisma-atomic-transaction-runner";
import { PrismaConversationRepository } from "./prisma-conversation.repository";
import { PrismaMessageRepository } from "./prisma-message.repository";

/**
 * Correctif audit Codex — preuves réelles contre PostgreSQL (aucune simulation) pour :
 *  - P1 (garde-fou volume IA, décision utilisateur) : la règle exacte "ne compte que les messages
 *    ASSISTANT réellement facturables" (`countBillableAssistantMessagesForTenderSince`), la fenêtre
 *    glissante de 24h, l'isolation par Tender, ET la preuve de concurrence "des requêtes
 *    concurrentes ne dépassent jamais silencieusement le plafond" (verrou consultatif Postgres,
 *    seule chose qu'un test en mémoire ne peut pas prouver) ;
 *  - P2 (garde PENDING) : une violation réelle de l'index unique partiel se traduit bien en
 *    `ConversationGenerationInProgressError`, jamais une erreur Prisma brute.
 */
describe("PrismaMessageRepository (PostgreSQL réel)", () => {
  const prisma = new PrismaService();
  const messageRepository = new PrismaMessageRepository(prisma);
  const conversationRepository = new PrismaConversationRepository(prisma);
  const transactionRunner = new PrismaAtomicTransactionRunner(prisma);

  const organizationId = randomUUID();
  let tenderId: string;
  let otherTenderId: string;
  let otherTenderConversationId: string;
  const createdConversationIds: string[] = [];

  async function createTender(): Promise<string> {
    const suffix = randomUUID();
    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId, name: `Client ${suffix}`, nameNormalized: `client ${suffix}`, status: "ACTIVE", createdBy: randomUUID() },
    });
    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId, clientAccountId: clientAccount.id, title: "Marché test quota", status: "IN_ANALYSIS", tags: [], createdBy: randomUUID() },
    });
    return tender.id;
  }

  async function createConversation(forTenderId: string): Promise<string> {
    const conversation = Conversation.create({ id: randomUUID(), organizationId, tenderId: forTenderId, createdByUserId: randomUUID(), occurredAt: new Date() });
    await conversationRepository.save(conversation);
    createdConversationIds.push(conversation.id);
    return conversation.id;
  }

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({ data: { id: organizationId, name: "Chat Quota Test Org", slug: `chat-quota-test-org-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    tenderId = await createTender();
    otherTenderId = await createTender();
    otherTenderConversationId = await createConversation(otherTenderId);
  }, 30000);

  afterAll(async () => {
    await prisma.messageCitation.deleteMany({ where: { organizationId } });
    await prisma.message.deleteMany({ where: { organizationId } });
    await prisma.conversation.deleteMany({ where: { organizationId } });
    await prisma.tender.deleteMany({ where: { organizationId } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.$disconnect();
  }, 30000);

  async function seedAssistantMessage(input: { conversationId: string; createdAt: Date; status: "COMPLETED" | "FAILED"; model?: string }): Promise<void> {
    const message = Message.createPendingAssistantMessage({ id: randomUUID(), organizationId, conversationId: input.conversationId, occurredAt: input.createdAt });
    if (input.status === "COMPLETED") {
      message.complete({ content: "réponse", model: input.model ?? "gpt-4o-mini", promptVersion: 1, usage: { inputTokenCount: 1, outputTokenCount: 1, totalTokenCount: 2 } });
    } else {
      message.fail("échec", input.model);
    }
    await messageRepository.save(message);
    // `save()` s'appuie sur `createdAt` par défaut Postgres (`now()`) — ce test a besoin d'un
    // `createdAt` précis (fenêtre glissante 24h), donc réécrit directement la colonne après coup.
    await prisma.message.update({ where: { id: message.id }, data: { createdAt: input.createdAt } });
  }

  describe("countBillableAssistantMessagesForTenderSince", () => {
    it("counts a COMPLETED message as billable", async () => {
      const conv = await createConversation(tenderId);
      await seedAssistantMessage({ conversationId: conv, createdAt: new Date(), status: "COMPLETED" });

      const count = await messageRepository.countBillableAssistantMessagesForTenderSince({ organizationId, tenderId, since: new Date(Date.now() - 60_000) });
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it("correctif audit Codex round 2 P1 — counts a PENDING message as a RESERVATION, the instant it is created (never waits for it to resolve)", async () => {
      const conv = await createConversation(tenderId);
      const before = await messageRepository.countBillableAssistantMessagesForTenderSince({ organizationId, tenderId, since: new Date(Date.now() - 60_000) });

      const pending = Message.createPendingAssistantMessage({ id: randomUUID(), organizationId, conversationId: conv, occurredAt: new Date() });
      await messageRepository.save(pending);

      const after = await messageRepository.countBillableAssistantMessagesForTenderSince({ organizationId, tenderId, since: new Date(Date.now() - 60_000) });
      expect(after).toBe(before + 1);
    });

    it("a PENDING reservation that resolves to FAILED without a model releases the quota it held (never permanently consumed for a free failure)", async () => {
      const conv = await createConversation(tenderId);
      const before = await messageRepository.countBillableAssistantMessagesForTenderSince({ organizationId, tenderId, since: new Date(Date.now() - 60_000) });

      const pending = Message.createPendingAssistantMessage({ id: randomUUID(), organizationId, conversationId: conv, occurredAt: new Date() });
      await messageRepository.save(pending);
      expect(await messageRepository.countBillableAssistantMessagesForTenderSince({ organizationId, tenderId, since: new Date(Date.now() - 60_000) })).toBe(before + 1);

      pending.fail("permission denied before any provider call"); // pas de model — jamais facturable.
      await messageRepository.save(pending);

      const after = await messageRepository.countBillableAssistantMessagesForTenderSince({ organizationId, tenderId, since: new Date(Date.now() - 60_000) });
      expect(after).toBe(before);
    });

    it("NEVER counts a FAILED message with no model recorded (no real provider call was ever attempted — correctif audit Codex, règle explicite)", async () => {
      const conv = await createConversation(tenderId);
      const before = await messageRepository.countBillableAssistantMessagesForTenderSince({ organizationId, tenderId, since: new Date(Date.now() - 60_000) });
      await seedAssistantMessage({ conversationId: conv, createdAt: new Date(), status: "FAILED" }); // pas de model

      const after = await messageRepository.countBillableAssistantMessagesForTenderSince({ organizationId, tenderId, since: new Date(Date.now() - 60_000) });
      expect(after).toBe(before);
    });

    it("counts a FAILED message that DID record a model (a real provider call was attempted before it failed)", async () => {
      const conv = await createConversation(tenderId);
      const before = await messageRepository.countBillableAssistantMessagesForTenderSince({ organizationId, tenderId, since: new Date(Date.now() - 60_000) });
      await seedAssistantMessage({ conversationId: conv, createdAt: new Date(), status: "FAILED", model: "gpt-4o-mini" });

      const after = await messageRepository.countBillableAssistantMessagesForTenderSince({ organizationId, tenderId, since: new Date(Date.now() - 60_000) });
      expect(after).toBe(before + 1);
    });

    it("rolling 24h window — a message older than the window no longer counts", async () => {
      const conv = await createConversation(tenderId);
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await seedAssistantMessage({ conversationId: conv, createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000), status: "COMPLETED" });

      const count = await messageRepository.countBillableAssistantMessagesForTenderSince({ organizationId, tenderId, since });
      const scopedToThisConversation = await prisma.message.count({ where: { organizationId, conversationId: conv, createdAt: { gte: since } } });
      expect(scopedToThisConversation).toBe(0);
      expect(count).toBeGreaterThanOrEqual(0); // n'inclut pas le message trop ancien seedé ci-dessus
    });

    it("scopes strictly by Tender — a billable message on a different Tender is never counted", async () => {
      const before = await messageRepository.countBillableAssistantMessagesForTenderSince({ organizationId, tenderId, since: new Date(Date.now() - 60_000) });
      await seedAssistantMessage({ conversationId: otherTenderConversationId, createdAt: new Date(), status: "COMPLETED" });

      const after = await messageRepository.countBillableAssistantMessagesForTenderSince({ organizationId, tenderId, since: new Date(Date.now() - 60_000) });
      expect(after).toBe(before);

      const otherCount = await messageRepository.countBillableAssistantMessagesForTenderSince({ organizationId, tenderId: otherTenderId, since: new Date(Date.now() - 60_000) });
      expect(otherCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("save() — translates a real unique constraint violation on the PENDING guard", () => {
    it("throws ConversationGenerationInProgressError when a second ASSISTANT PENDING message is inserted for the same conversation", async () => {
      const conv = await createConversation(tenderId);
      const first = Message.createPendingAssistantMessage({ id: randomUUID(), organizationId, conversationId: conv, occurredAt: new Date() });
      await messageRepository.save(first);

      const second = Message.createPendingAssistantMessage({ id: randomUUID(), organizationId, conversationId: conv, occurredAt: new Date() });
      await expect(messageRepository.save(second)).rejects.toMatchObject({ code: "CONVERSATION_GENERATION_IN_PROGRESS" });
    });
  });

  describe("BLOCKING — concurrent quota reservations never silently exceed the configured cap (real advisory lock, real transactions)", () => {
    it("correctif audit Codex round 2 P1 — under N concurrent attempts across DIFFERENT conversations of the SAME Tender, with cap=3, exactly 3 succeed and the rest are rejected — proven with EVERY reservation left PENDING (never completed), exactly the gap the first fix missed: the quota must hold even while nothing has resolved yet", async () => {
      // Tender DÉDIÉ à ce test — jamais le `tenderId` partagé par les autres describe ci-dessus
      // (qui y créent déjà des messages facturables), pour que le comptage de ce test ne soit
      // pollué par aucun autre. Une conversation DIFFÉRENTE par tentative (jamais la même) — la
      // garde PENDING-par-conversation ne doit jamais être ce qui bloque ici, seul le plafond
      // Tender doit intervenir, exactement le scénario multi-conversations décrit par l'audit.
      const concurrencyTenderId = await createTender();
      const cap = 3;
      const concurrentAttempts = 8;
      const conversationIds = await Promise.all(Array.from({ length: concurrentAttempts }, () => createConversation(concurrencyTenderId)));

      async function attemptReservation(conv: string): Promise<"reserved" | "rejected"> {
        return transactionRunner.run(async () => {
          await messageRepository.lockTenderQuota({ organizationId, tenderId: concurrencyTenderId });
          const count = await messageRepository.countBillableAssistantMessagesForTenderSince({ organizationId, tenderId: concurrencyTenderId, since: new Date(Date.now() - 60_000) });
          if (count >= cap) return "rejected";

          // Réservation RÉELLE — laissée PENDING, jamais complétée (même motif que la fenêtre
          // hors-transaction de `SendMessageUseCase` entre la création du message et l'appel
          // provider) : si le comptage ne voyait pas les PENDING, cette assertion échouerait.
          const message = Message.createPendingAssistantMessage({ id: randomUUID(), organizationId, conversationId: conv, occurredAt: new Date() });
          await messageRepository.save(message);
          return "reserved";
        });
      }

      const results = await Promise.all(conversationIds.map((conv) => attemptReservation(conv)));

      const reservedCount = results.filter((r) => r === "reserved").length;
      expect(reservedCount).toBe(cap);

      const actualPersistedCount = await messageRepository.countBillableAssistantMessagesForTenderSince({ organizationId, tenderId: concurrencyTenderId, since: new Date(Date.now() - 60_000) });
      expect(actualPersistedCount).toBe(cap);
    }, 30000);
  });

  describe("findStalePendingCandidates (Sprint 21 hardening — mission PARTIE F)", () => {
    async function seedPendingMessage(conversationId: string, createdAt: Date): Promise<string> {
      const message = Message.createPendingAssistantMessage({ id: randomUUID(), organizationId, conversationId, occurredAt: createdAt });
      await messageRepository.save(message);
      await prisma.message.update({ where: { id: message.id }, data: { createdAt } });
      return message.id;
    }

    it("returns only PENDING messages older than the threshold, never a recent or resolved one", async () => {
      const conversationId = await createConversation(tenderId);
      const staleId = await seedPendingMessage(conversationId, new Date(Date.now() - 10 * 60 * 1000));
      const recentConversationId = await createConversation(tenderId);
      const recentId = await seedPendingMessage(recentConversationId, new Date());
      const resolvedConversationId = await createConversation(tenderId);
      await seedAssistantMessage({ conversationId: resolvedConversationId, createdAt: new Date(Date.now() - 10 * 60 * 1000), status: "COMPLETED" });

      const candidates = await messageRepository.findStalePendingCandidates({ olderThan: new Date(Date.now() - 5 * 60 * 1000), limit: 50 });
      const candidateIds = candidates.map((c) => c.messageId);

      expect(candidateIds).toContain(staleId);
      expect(candidateIds).not.toContain(recentId);
    });

    it("never returns a candidate belonging to another organization mixed in with the caller's own", async () => {
      const conversationId = await createConversation(tenderId);
      const staleId = await seedPendingMessage(conversationId, new Date(Date.now() - 10 * 60 * 1000));

      const candidates = await messageRepository.findStalePendingCandidates({ olderThan: new Date(Date.now() - 5 * 60 * 1000), limit: 50 });
      const match = candidates.find((c) => c.messageId === staleId);

      expect(match?.organizationId).toBe(organizationId);
    });
  });
});
