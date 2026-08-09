import { describe, expect, it } from "vitest";
import { Message, MessageRole, MessageStatus } from "./message.entity";

describe("Message", () => {
  const occurredAt = new Date("2026-01-01T00:00:00.000Z");

  it("a USER message is always created COMPLETED", () => {
    const message = Message.createUserMessage({ id: "msg-1", organizationId: "org-1", conversationId: "conv-1", content: "Quelle est la date limite ?", createdByUserId: "user-1", occurredAt });
    expect(message.role).toBe(MessageRole.User);
    expect(message.status).toBe(MessageStatus.Completed);
    expect(message.createdByUserId).toBe("user-1");
  });

  it("an ASSISTANT message is always created PENDING, with no createdByUserId", () => {
    const message = Message.createPendingAssistantMessage({ id: "msg-2", organizationId: "org-1", conversationId: "conv-1", occurredAt });
    expect(message.role).toBe(MessageRole.Assistant);
    expect(message.status).toBe(MessageStatus.Pending);
    expect(message.createdByUserId).toBeUndefined();
  });

  it("complete() transitions PENDING -> COMPLETED and records model/promptVersion/usage", () => {
    const message = Message.createPendingAssistantMessage({ id: "msg-2", organizationId: "org-1", conversationId: "conv-1", occurredAt });
    message.complete({ content: "La date limite est le 1er septembre.", model: "gpt-4o-mini", promptVersion: 1, usage: { inputTokenCount: 100, outputTokenCount: 20, totalTokenCount: 120 } });

    expect(message.status).toBe(MessageStatus.Completed);
    expect(message.content).toBe("La date limite est le 1er septembre.");
    expect(message.model).toBe("gpt-4o-mini");
    expect(message.promptVersion).toBe(1);
    expect(message.totalTokenCount).toBe(120);
  });

  it("fail() transitions PENDING -> FAILED and records the error message", () => {
    const message = Message.createPendingAssistantMessage({ id: "msg-2", organizationId: "org-1", conversationId: "conv-1", occurredAt });
    message.fail("AI provider unavailable");

    expect(message.status).toBe(MessageStatus.Failed);
    expect(message.errorMessage).toBe("AI provider unavailable");
  });
});
