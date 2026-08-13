import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import type { CommentEntityType } from "../../domain/comment.entity";
import { assertWorkspaceAccess } from "../policies/workspace-authorization.policy";
import { COMMENT_REPOSITORY, type CommentRepository } from "../ports/comment.repository";
import { MENTION_REPOSITORY, type MentionRepository } from "../ports/mention.repository";
import { toCommentSummary, type CommentSummary } from "../dtos";

export type ListCommentsQuery = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  entityType?: CommentEntityType | undefined;
  entityId?: string | undefined;
}>;

@Injectable()
export class ListCommentsUseCase {
  constructor(
    @Inject(COMMENT_REPOSITORY) private readonly commentRepository: CommentRepository,
    @Inject(MENTION_REPOSITORY) private readonly mentionRepository: MentionRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: ListCommentsQuery): Promise<CommentSummary[]> {
    await assertWorkspaceAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadWorkspace,
    });

    const comments =
      query.entityType !== undefined && query.entityId !== undefined
        ? await this.commentRepository.listByEntity({ organizationId: query.organizationId, tenderId: query.tenderId, entityType: query.entityType, entityId: query.entityId })
        : await this.commentRepository.listByTender({ organizationId: query.organizationId, tenderId: query.tenderId });

    // Sprint 21 (hardening) — mission §26 (N+1) : une seule requête groupée plutôt qu'une requête
    // par commentaire, jamais le mode de comptage naïf O(N).
    const mentions = await this.mentionRepository.listByComments({ organizationId: query.organizationId, commentIds: comments.map((comment) => comment.id) });
    const mentionsByCommentId = new Map<string, typeof mentions>();
    for (const mention of mentions) {
      const existing = mentionsByCommentId.get(mention.commentId);
      if (existing) existing.push(mention);
      else mentionsByCommentId.set(mention.commentId, [mention]);
    }

    return comments.map((comment) => toCommentSummary(comment, mentionsByCommentId.get(comment.id) ?? []));
  }
}
