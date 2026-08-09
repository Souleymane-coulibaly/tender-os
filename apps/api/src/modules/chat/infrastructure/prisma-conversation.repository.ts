import { Injectable } from "@nestjs/common";
import type { Conversation as ConversationRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { ConversationListFilters, ConversationRepository } from "../application/ports/conversation.repository";
import { Conversation } from "../domain/conversation.entity";

function toDomain(record: ConversationRecord): Conversation {
  return Conversation.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    clientAccountId: record.clientAccountId ?? undefined,
    lotId: record.lotId ?? undefined,
    createdByUserId: record.createdByUserId,
    title: record.title ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    archivedAt: record.archivedAt ?? undefined,
  });
}

function toPersistence(conversation: Conversation) {
  return {
    id: conversation.id,
    organizationId: conversation.organizationId,
    tenderId: conversation.tenderId,
    clientAccountId: conversation.clientAccountId ?? null,
    lotId: conversation.lotId ?? null,
    createdByUserId: conversation.createdByUserId,
    title: conversation.title ?? null,
    updatedAt: conversation.updatedAt,
    archivedAt: conversation.archivedAt ?? null,
  };
}

@Injectable()
export class PrismaConversationRepository implements ConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; conversationId: string }): Promise<Conversation | null> {
    const record = await this.prisma.currentClient().conversation.findFirst({
      where: { id: input.conversationId, organizationId: input.organizationId },
    });
    return record ? toDomain(record) : null;
  }

  async listByTender(filters: ConversationListFilters): Promise<Conversation[]> {
    const records = await this.prisma.currentClient().conversation.findMany({
      where: {
        organizationId: filters.organizationId,
        tenderId: filters.tenderId,
        ...(filters.includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: { createdAt: "desc" },
    });
    return records.map(toDomain);
  }

  async save(conversation: Conversation): Promise<void> {
    const data = toPersistence(conversation);
    await this.prisma.currentClient().conversation.upsert({ where: { id: data.id }, create: data, update: data });
  }
}
