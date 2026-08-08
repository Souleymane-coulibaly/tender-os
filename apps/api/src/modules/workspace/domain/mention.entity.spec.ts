import { describe, expect, it } from "vitest";
import { Mention } from "./mention.entity";

describe("Mention", () => {
  it("references a real user id, never free text", () => {
    const mention = Mention.create({
      id: "mention-1",
      organizationId: "org-1",
      commentId: "comment-1",
      mentionedUserId: "user-2",
      occurredAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(mention.mentionedUserId).toBe("user-2");
    expect(mention.commentId).toBe("comment-1");
  });

  it("rehydrates without mutation", () => {
    const props = {
      id: "mention-1",
      organizationId: "org-1",
      commentId: "comment-1",
      mentionedUserId: "user-2",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };

    const mention = Mention.rehydrate(props);

    expect(mention.id).toBe(props.id);
    expect(mention.createdAt).toBe(props.createdAt);
  });
});
