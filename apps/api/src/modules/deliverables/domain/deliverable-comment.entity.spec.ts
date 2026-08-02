import { describe, expect, it } from "vitest";
import { DeliverableComment } from "./deliverable-comment.entity";
import { DeliverableCommentStatus } from "./deliverable-comment-status";
import { DeliverableCommentAlreadyResolvedError } from "./errors";

const NOW = new Date("2026-09-01T10:00:00.000Z");

describe("DeliverableComment", () => {
  it("starts OPEN and can be resolved once", () => {
    const comment = DeliverableComment.create({ id: "c-1", organizationId: "org-1", deliverableId: "d-1", content: "À revoir", authorId: "user-1", occurredAt: NOW });
    expect(comment.status).toBe(DeliverableCommentStatus.Open);
    comment.resolve({ resolvedBy: "user-2", occurredAt: NOW });
    expect(comment.status).toBe(DeliverableCommentStatus.Resolved);
    expect(comment.resolvedBy).toBe("user-2");
  });

  it("refuses to resolve an already-resolved comment", () => {
    const comment = DeliverableComment.create({ id: "c-1", organizationId: "org-1", deliverableId: "d-1", content: "À revoir", authorId: "user-1", occurredAt: NOW });
    comment.resolve({ resolvedBy: "user-2", occurredAt: NOW });
    expect(() => comment.resolve({ resolvedBy: "user-3", occurredAt: NOW })).toThrow(DeliverableCommentAlreadyResolvedError);
  });

  it("rejects empty content", () => {
    expect(() => DeliverableComment.create({ id: "c-1", organizationId: "org-1", deliverableId: "d-1", content: "   ", authorId: "user-1", occurredAt: NOW })).toThrow();
  });
});
