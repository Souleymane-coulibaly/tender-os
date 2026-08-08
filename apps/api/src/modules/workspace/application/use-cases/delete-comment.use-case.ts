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

export type DeleteCommentCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  commentId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

/** V2 Sprint 7 §21 — suppression toujours DOUCE (jamais physique), réservée à l'auteur ce sprint
 *  (pas de modération admin — réduction de périmètre assumée, mission §21 la rend "éventuelle"). */
@Injectable()
export class DeleteCommentUseCase {
  constructor(
    @Inject(COMMENT_REPOSITORY) private readonly commentRepository: CommentRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: DeleteCommentCommand): Promise<void> {
    await assertWorkspaceAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageWorkspace,
    });

    const comment = await this.commentRepository.findById({ organizationId: command.organizationId, commentId: command.commentId });
    if (!comment || comment.tenderId !== command.tenderId) {
      throw new CommentNotFoundError();
    }
    if (comment.authorId !== command.actorId) {
      throw new CommentEditForbiddenError();
    }

    // Correctif audit Codex P1-02 — sauvegarde + AuditLog dans UNE SEULE transaction Postgres.
    await this.atomicTransactionRunner.run(async () => {
      comment.softDelete(this.clock.now());
      await this.commentRepository.save(comment);

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "workspace.comment_deleted",
        resourceType: "comment",
        resourceId: comment.id,
        requestId: command.requestId,
        metadata: { tenderId: command.tenderId },
      });
    });
  }
}
