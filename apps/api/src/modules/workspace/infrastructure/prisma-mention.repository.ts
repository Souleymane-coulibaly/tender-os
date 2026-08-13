import { Injectable } from "@nestjs/common";
import type { Mention as MentionRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { MentionRepository } from "../application/ports/mention.repository";
import { Mention } from "../domain/mention.entity";

function toDomain(record: MentionRecord): Mention {
  return Mention.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    commentId: record.commentId,
    mentionedUserId: record.mentionedUserId,
    createdAt: record.createdAt,
  });
}

/** `create()` n'est utilisée que pour les tests/cas isolés — la création réelle passe TOUJOURS par
 *  `CommentRepository.createWithMentions` (mission §47, jamais une mention sans son commentaire). */
@Injectable()
export class PrismaMentionRepository implements MentionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByComment(input: { organizationId: string; commentId: string }): Promise<Mention[]> {
    const records = await this.prisma.currentClient().mention.findMany({
      where: { organizationId: input.organizationId, commentId: input.commentId },
      orderBy: { createdAt: "asc" },
    });
    return records.map(toDomain);
  }

  async listByComments(input: { organizationId: string; commentIds: readonly string[] }): Promise<Mention[]> {
    if (input.commentIds.length === 0) return [];
    const records = await this.prisma.currentClient().mention.findMany({
      where: { organizationId: input.organizationId, commentId: { in: [...input.commentIds] } },
      orderBy: { createdAt: "asc" },
    });
    return records.map(toDomain);
  }

  async create(mention: Mention): Promise<void> {
    await this.prisma.currentClient().mention.create({
      data: { id: mention.id, organizationId: mention.organizationId, commentId: mention.commentId, mentionedUserId: mention.mentionedUserId },
    });
  }
}
