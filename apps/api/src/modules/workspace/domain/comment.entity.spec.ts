import { describe, expect, it } from "vitest";
import { Comment, CommentEntityType } from "./comment.entity";
import { CommentDeletedError } from "./errors";

describe("Comment", () => {
  const occurredAt = new Date("2026-01-01T00:00:00.000Z");

  function create(): Comment {
    return Comment.create({
      id: "comment-1",
      organizationId: "org-1",
      tenderId: "tender-1",
      entityType: CommentEntityType.Task,
      entityId: "task-1",
      authorId: "user-1",
      body: "Il manque la RIB.",
      occurredAt,
    });
  }

  it("starts with no editedAt/deletedAt", () => {
    const comment = create();

    expect(comment.editedAt).toBeUndefined();
    expect(comment.isDeleted).toBe(false);
  });

  it("edit() updates the body and stamps editedAt — never rewrites createdAt", () => {
    const comment = create();
    const editedAt = new Date("2026-01-02T00:00:00.000Z");

    comment.edit("Il manque la RIB et le RIB du sous-traitant.", editedAt);

    expect(comment.body).toBe("Il manque la RIB et le RIB du sous-traitant.");
    expect(comment.editedAt).toBe(editedAt);
    expect(comment.createdAt).toBe(occurredAt);
  });

  it("softDelete() marks deletedAt, never removing the row", () => {
    const comment = create();
    const deletedAt = new Date("2026-01-03T00:00:00.000Z");

    comment.softDelete(deletedAt);

    expect(comment.isDeleted).toBe(true);
    expect(comment.deletedAt).toBe(deletedAt);
    expect(comment.body).toBe("Il manque la RIB.");
  });

  it("rejects editing an already-deleted comment", () => {
    const comment = create();
    comment.softDelete(new Date());

    expect(() => comment.edit("x", new Date())).toThrow(CommentDeletedError);
  });

  it("rejects deleting an already-deleted comment", () => {
    const comment = create();
    comment.softDelete(new Date());

    expect(() => comment.softDelete(new Date())).toThrow(CommentDeletedError);
  });

  it("supports the V2 Sprint 18 LOT entity type (mission §7)", () => {
    const comment = Comment.create({
      id: "comment-1",
      organizationId: "org-1",
      tenderId: "tender-1",
      entityType: CommentEntityType.Lot,
      entityId: "lot-1",
      authorId: "user-1",
      body: "Question sur le lot 2.",
      occurredAt,
    });

    expect(comment.entityType).toBe(CommentEntityType.Lot);
  });
});
