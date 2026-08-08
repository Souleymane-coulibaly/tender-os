import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { CommentEditForbiddenError, CommentNotFoundError } from "../../domain/errors";
import { assertWorkspaceAccess } from "../policies/workspace-authorization.policy";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { COMMENT_REPOSITORY, type CommentRepository } from "../ports/comment.repository";
import { MENTION_REPOSITORY, type MentionRepository } from "../ports/mention.repository";
import { toCommentSummary, type CommentSummary } from "../dtos";

async function loadComment(repository: CommentRepository, input: { organizationId: string; commentId: string }) {
  const comment = await repository.findById(input);
  if (!comment) {
    throw new CommentNotFoundError();
  }
  return comment;
}

export type EditCommentCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  commentId: string;
  actorId: string;
  actorRole: string;
  body: string;
  requestId?: string | undefined;
}>;

/** V2 Sprint 7 §21 — par défaut, seul l'auteur peut modifier son propre commentaire (pas de
 *  modération admin ce sprint). */
@Injectable()
export class EditCommentUseCase {
  constructor(
    @Inject(COMMENT_REPOSITORY) private readonly commentRepository: CommentRepository,
    @Inject(MENTION_REPOSITORY) private readonly mentionRepository: MentionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: EditCommentCommand): Promise<CommentSummary> {
    await assertWorkspaceAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageWorkspace,
    });

    const comment = await loadComment(this.commentRepository, { organizationId: command.organizationId, commentId: command.commentId });
    if (comment.tenderId !== command.tenderId) {
      throw new CommentNotFoundError();
    }
    if (comment.authorId !== command.actorId) {
      throw new CommentEditForbiddenError();
    }

    // Correctif audit Codex P1-02 — sauvegarde + AuditLog dans UNE SEULE transaction Postgres.
    await this.atomicTransactionRunner.run(async () => {
      comment.edit(command.body, this.clock.now());
      await this.commentRepository.save(comment);

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "workspace.comment_edited",
        resourceType: "comment",
        resourceId: comment.id,
        requestId: command.requestId,
        metadata: { tenderId: command.tenderId },
      });
    });

    const mentions = await this.mentionRepository.listByComment({ organizationId: command.organizationId, commentId: comment.id });
    return toCommentSummary(comment, mentions);
  }
}
