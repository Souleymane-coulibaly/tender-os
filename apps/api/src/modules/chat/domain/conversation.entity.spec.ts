import { describe, expect, it } from "vitest";
import { Conversation } from "./conversation.entity";

describe("Conversation", () => {
  const occurredAt = new Date("2026-01-01T00:00:00.000Z");

  it("creates a conversation scoped to exactly one Tender, not archived", () => {
    const conversation = Conversation.create({
      id: "conv-1",
      organizationId: "org-1",
      tenderId: "tender-1",
      clientAccountId: "client-1",
      createdByUserId: "user-1",
      occurredAt,
    });

    expect(conversation.tenderId).toBe("tender-1");
    expect(conversation.clientAccountId).toBe("client-1");
    expect(conversation.isArchived).toBe(false);
    expect(conversation.archivedAt).toBeUndefined();
  });

  it("archive() sets archivedAt and never mutates tenderId/clientAccountId", () => {
    const conversation = Conversation.create({ id: "conv-1", organizationId: "org-1", tenderId: "tender-1", clientAccountId: "client-1", createdByUserId: "user-1", occurredAt });
    const archivedAt = new Date("2026-02-01T00:00:00.000Z");

    conversation.archive(archivedAt);

    expect(conversation.isArchived).toBe(true);
    expect(conversation.archivedAt).toBe(archivedAt);
    expect(conversation.tenderId).toBe("tender-1");
    expect(conversation.clientAccountId).toBe("client-1");
  });

  it("has no method to reassign tenderId or clientAccountId (mission §5)", () => {
    const conversation = Conversation.create({ id: "conv-1", organizationId: "org-1", tenderId: "tender-1", createdByUserId: "user-1", occurredAt });
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(conversation))).not.toEqual(expect.arrayContaining(["changeTender", "setTenderId", "changeClientAccount"]));
  });
});
