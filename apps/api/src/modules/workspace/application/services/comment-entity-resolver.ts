import { loadChecklistItem, type ChecklistItemRepository } from "../../../tenders";
import { CommentEntityType } from "../../domain/comment.entity";
import { InvalidCommentEntityError } from "../../domain/errors";
import type { TaskRepository } from "../ports/task.repository";
import { loadTask } from "../use-cases/update-task.use-case";

/** V2 Sprint 7 §20 — vérifie que `entityId` appartient bien au `tenderId`/`organizationId` du
 *  commentaire AVANT toute écriture (mission "jamais un `findUnique({id})` nu"). Un résolveur par
 *  `entityType`, jamais une résolution générique non gouvernée (mission §19 "éviter un
 *  polymorphisme non sécurisé"). */
export async function assertCommentEntityBelongsToTender(
  repositories: { checklistItemRepository: ChecklistItemRepository; taskRepository: TaskRepository },
  input: { organizationId: string; tenderId: string; entityType: CommentEntityType; entityId: string },
): Promise<void> {
  switch (input.entityType) {
    case CommentEntityType.Tender:
      if (input.entityId !== input.tenderId) {
        throw new InvalidCommentEntityError();
      }
      return;
    case CommentEntityType.Task:
      await loadTask(repositories.taskRepository, { organizationId: input.organizationId, tenderId: input.tenderId, taskId: input.entityId });
      return;
    case CommentEntityType.ChecklistItem:
      await loadChecklistItem(repositories.checklistItemRepository, { organizationId: input.organizationId, tenderId: input.tenderId, itemId: input.entityId });
      return;
  }
}
