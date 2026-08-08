import { Injectable } from "@nestjs/common";
import type { Comment as CommentRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { CommentRepository } from "../application/ports/comment.repository";
import { Comment, type CommentEntityType } from "../domain/comment.entity";
import type { Mention } from "../domain/mention.entity";

function toDomain(record: CommentRecord): Comment {
  return Comment.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    entityType: record.entityType as CommentEntityType,
    entityId: record.entityId,
    authorId: record.authorId,
    body: record.body,
    createdAt: record.createdAt,
    editedAt: record.editedAt ?? undefined,
    deletedAt: record.deletedAt ?? undefined,
  });
}

function toPersistence(comment: Comment) {
  return {
    id: comment.id,
    organizationId: comment.organizationId,
    tenderId: comment.tenderId,
    entityType: comment.entityType,
    entityId: comment.entityId,
    authorId: comment.authorId,
    body: comment.body,
    editedAt: comment.editedAt ?? null,
    deletedAt: comment.deletedAt ?? null,
  };
}

@Injectable()
export class PrismaCommentRepository implements CommentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; commentId: string }): Promise<Comment | null> {
    const record = await this.prisma.currentClient().comment.findFirst({
      where: { id: input.commentId, organizationId: input.organizationId },
    });
    return record ? toDomain(record) : null;
  }

  async listByEntity(input: { organizationId: string; entityType: CommentEntityType; entityId: string }): Promise<Comment[]> {
    const records = await this.prisma.currentClient().comment.findMany({
      where: { organizationId: input.organizationId, entityType: input.entityType, entityId: input.entityId },
      orderBy: { createdAt: "asc" },
    });
    return records.map(toDomain);
  }

  async listByTender(input: { organizationId: string; tenderId: string }): Promise<Comment[]> {
    const records = await this.prisma.currentClient().comment.findMany({
      where: { organizationId: input.organizationId, tenderId: input.tenderId },
      orderBy: { createdAt: "asc" },
    });
    return records.map(toDomain);
  }

  /** V2 Sprint 7 §47 — écrit le commentaire ET ses mentions dans UNE SEULE transaction Postgres.
   *  `withTransaction` rejoint une transaction ambiante déjà active si présente (même motif que
   *  `PrismaTenderLotRepository.createAppendedAtEnd`), sinon en ouvre une localement. */
  async createWithMentions(comment: Comment, mentions: readonly Mention[]): Promise<void> {
    await this.prisma.withTransaction(async (tx) => {
      await tx.comment.create({ data: toPersistence(comment) });
      if (mentions.length > 0) {
        await tx.mention.createMany({
          data: mentions.map((mention) => ({
            id: mention.id,
            organizationId: mention.organizationId,
            commentId: mention.commentId,
            mentionedUserId: mention.mentionedUserId,
          })),
        });
      }
    });
  }

  async save(comment: Comment): Promise<void> {
    const data = toPersistence(comment);
    await this.prisma.currentClient().comment.update({ where: { id: data.id }, data });
  }
}
