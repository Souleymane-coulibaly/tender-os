import { beforeEach, describe, expect, it, vi } from "vitest";
import { Message, MessageStatus } from "../../domain/message.entity";
import { InMemoryMessageRepository } from "../../test-support/fakes";
import { ReclaimStalePendingMessagesUseCase } from "./reclaim-stale-pending-messages.use-case";

const ORG = "org-1";
const NOW = new Date("2026-08-01T10:00:00.000Z");
const TWO_MINUTES_MS = 2 * 60 * 1000;

describe("ReclaimStalePendingMessagesUseCase", () => {
  let messageRepository: InMemoryMessageRepository;

  beforeEach(() => {
    messageRepository = new InMemoryMessageRepository();
  });

  it("BLOQUANT (mission PARTIE F) — fails a PENDING message stuck beyond the threshold, unblocking its conversation, never marking it as billable", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW.getTime() - TWO_MINUTES_MS - 1));
    const message = Message.createPendingAssistantMessage({ id: "msg-1", organizationId: ORG, conversationId: "conv-1", occurredAt: new Date() });
    messageRepository.messages.push(message);
    vi.setSystemTime(NOW);

    const useCase = new ReclaimStalePendingMessagesUseCase(messageRepository);
    const result = await useCase.execute({ staleThresholdMs: TWO_MINUTES_MS, batchSize: 50 });

    expect(result.reclaimed).toBe(1);
    const stored = await messageRepository.findById({ organizationId: ORG, messageId: "msg-1" });
    expect(stored?.status).toBe(MessageStatus.Failed);
    expect(stored?.model).toBeUndefined();
    const stillPending = await messageRepository.findPendingByConversation({ organizationId: ORG, conversationId: "conv-1" });
    expect(stillPending).toBeNull();
    vi.useRealTimers();
  });

  it("never touches a PENDING message still within the threshold", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const message = Message.createPendingAssistantMessage({ id: "msg-2", organizationId: ORG, conversationId: "conv-2", occurredAt: new Date() });
    messageRepository.messages.push(message);

    const useCase = new ReclaimStalePendingMessagesUseCase(messageRepository);
    const result = await useCase.execute({ staleThresholdMs: TWO_MINUTES_MS, batchSize: 50 });

    expect(result.reclaimed).toBe(0);
    const stored = await messageRepository.findById({ organizationId: ORG, messageId: "msg-2" });
    expect(stored?.status).toBe(MessageStatus.Pending);
    vi.useRealTimers();
  });

  it("never touches a COMPLETED or FAILED message (only PENDING is a stuck-state candidate)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW.getTime() - TWO_MINUTES_MS - 1));
    const completed = Message.createPendingAssistantMessage({ id: "msg-3", organizationId: ORG, conversationId: "conv-3", occurredAt: new Date() });
    completed.complete({ content: "answer", model: "gpt-4o", promptVersion: 1, usage: { inputTokenCount: 1, outputTokenCount: 1, totalTokenCount: 2 } });
    messageRepository.messages.push(completed);
    vi.setSystemTime(NOW);

    const useCase = new ReclaimStalePendingMessagesUseCase(messageRepository);
    const result = await useCase.execute({ staleThresholdMs: TWO_MINUTES_MS, batchSize: 50 });

    expect(result.reclaimed).toBe(0);
    vi.useRealTimers();
  });
});
