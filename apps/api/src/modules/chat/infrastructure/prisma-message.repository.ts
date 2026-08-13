import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Message as MessageRecord, MessageCitation as MessageCitationRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { MessageRepository } from "../application/ports/message.repository";
import { ConversationGenerationInProgressError } from "../domain/errors";
import { CitationFindingType, CitationSourceType, MessageCitation } from "../domain/message-citation.entity";
import { Message, MessageRole, MessageStatus } from "../domain/message.entity";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function toDomain(record: MessageRecord): Message {
  return Message.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    conversationId: record.conversationId,
    role: record.role as MessageRole,
    content: record.content,
    status: record.status as MessageStatus,
    createdByUserId: record.createdByUserId ?? undefined,
    model: record.model ?? undefined,
    promptVersion: record.promptVersion ?? undefined,
    inputTokenCount: record.inputTokenCount ?? undefined,
    outputTokenCount: record.outputTokenCount ?? undefined,
    totalTokenCount: record.totalTokenCount ?? undefined,
    errorMessage: record.errorMessage ?? undefined,
    createdAt: record.createdAt,
  });
}

function toPersistence(message: Message) {
  return {
    id: message.id,
    organizationId: message.organizationId,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    status: message.status,
    createdByUserId: message.createdByUserId ?? null,
    model: message.model ?? null,
    promptVersion: message.promptVersion ?? null,
    inputTokenCount: message.inputTokenCount ?? null,
    outputTokenCount: message.outputTokenCount ?? null,
    totalTokenCount: message.totalTokenCount ?? null,
    errorMessage: message.errorMessage ?? null,
  };
}

function citationToDomain(record: MessageCitationRecord): MessageCitation {
  return MessageCitation.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    messageId: record.messageId,
    sourceType: record.sourceType as CitationSourceType,
    documentId: record.documentId ?? undefined,
    documentVersionId: record.documentVersionId ?? undefined,
    chunkSequence: record.chunkSequence ?? undefined,
    pageStart: record.pageStart ?? undefined,
    pageEnd: record.pageEnd ?? undefined,
    sheetName: record.sheetName ?? undefined,
    sectionTitle: record.sectionTitle ?? undefined,
    knowledgeEntryId: record.knowledgeEntryId ?? undefined,
    knowledgeEntryVersionId: record.knowledgeEntryVersionId ?? undefined,
    checklistItemId: record.checklistItemId ?? undefined,
    findingType: (record.findingType as CitationFindingType | null) ?? undefined,
    findingId: record.findingId ?? undefined,
    label: record.label,
    excerpt: record.excerpt ?? undefined,
    createdAt: record.createdAt,
  });
}

function citationToPersistence(citation: MessageCitation) {
  return {
    id: citation.id,
    organizationId: citation.organizationId,
    messageId: citation.messageId,
    sourceType: citation.sourceType,
    documentId: citation.documentId ?? null,
    documentVersionId: citation.documentVersionId ?? null,
    chunkSequence: citation.chunkSequence ?? null,
    pageStart: citation.pageStart ?? null,
    pageEnd: citation.pageEnd ?? null,
    sheetName: citation.sheetName ?? null,
    sectionTitle: citation.sectionTitle ?? null,
    knowledgeEntryId: citation.knowledgeEntryId ?? null,
    knowledgeEntryVersionId: citation.knowledgeEntryVersionId ?? null,
    checklistItemId: citation.checklistItemId ?? null,
    findingType: citation.findingType ?? null,
    findingId: citation.findingId ?? null,
    label: citation.label,
    excerpt: citation.excerpt ?? null,
  };
}

@Injectable()
export class PrismaMessageRepository implements MessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; messageId: string }): Promise<Message | null> {
    const record = await this.prisma.currentClient().message.findFirst({ where: { id: input.messageId, organizationId: input.organizationId } });
    return record ? toDomain(record) : null;
  }

  async listByConversation(input: { organizationId: string; conversationId: string }): Promise<Message[]> {
    const records = await this.prisma.currentClient().message.findMany({
      where: { organizationId: input.organizationId, conversationId: input.conversationId },
      orderBy: { createdAt: "asc" },
    });
    return records.map(toDomain);
  }

  async findPendingByConversation(input: { organizationId: string; conversationId: string }): Promise<Message | null> {
    const record = await this.prisma.currentClient().message.findFirst({
      where: { organizationId: input.organizationId, conversationId: input.conversationId, status: MessageStatus.Pending },
    });
    return record ? toDomain(record) : null;
  }

  async save(message: Message): Promise<void> {
    const data = toPersistence(message);
    try {
      await this.prisma.currentClient().message.upsert({ where: { id: data.id }, create: data, update: data });
    } catch (error) {
      // Correctif audit Codex P2 — seule contrainte unique susceptible d'être violée sur cette
      // table en dehors de la PK (id est un UUID généré applicativement, jamais en collision
      // réelle) : l'index partiel "un seul ASSISTANT PENDING par conversation". Une course entre
      // deux transactions concurrentes se traduit ici, jamais une erreur Prisma brute.
      if (isUniqueConstraintViolation(error)) {
        throw new ConversationGenerationInProgressError();
      }
      throw error;
    }
  }

  async lockTenderQuota(input: { organizationId: string; tenderId: string }): Promise<void> {
    await this.prisma.currentClient().$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${input.organizationId}:${input.tenderId}`}))`;
  }

  async countBillableAssistantMessagesForTenderSince(input: { organizationId: string; tenderId: string; since: Date }): Promise<number> {
    return this.prisma.currentClient().message.count({
      where: {
        organizationId: input.organizationId,
        role: MessageRole.Assistant,
        createdAt: { gte: input.since },
        conversation: { tenderId: input.tenderId },
        // Correctif audit Codex round 2 P1 — PENDING compte comme une RÉSERVATION (voir le port),
        // jamais uniquement COMPLETED/FAILED : sans lui, la garde ne réservait rien de réel entre
        // la création du message et sa résolution (hors transaction), laissant passer autant de
        // requêtes concurrentes que de conversations différentes du même Tender.
        OR: [{ status: MessageStatus.Pending }, { status: MessageStatus.Completed }, { status: MessageStatus.Failed, model: { not: null } }],
      },
    });
  }

  async saveCitations(citations: readonly MessageCitation[]): Promise<void> {
    if (citations.length === 0) return;
    await this.prisma.currentClient().messageCitation.createMany({ data: citations.map(citationToPersistence) });
  }

  async listCitationsByMessageId(input: { organizationId: string; messageId: string }): Promise<MessageCitation[]> {
    const records = await this.prisma.currentClient().messageCitation.findMany({
      where: { organizationId: input.organizationId, messageId: input.messageId },
      orderBy: { createdAt: "asc" },
    });
    return records.map(citationToDomain);
  }

  async listCitationsByMessageIds(input: { organizationId: string; messageIds: readonly string[] }): Promise<MessageCitation[]> {
    if (input.messageIds.length === 0) return [];
    const records = await this.prisma.currentClient().messageCitation.findMany({
      where: { organizationId: input.organizationId, messageId: { in: [...input.messageIds] } },
      orderBy: { createdAt: "asc" },
    });
    return records.map(citationToDomain);
  }

  async findStalePendingCandidates(input: { olderThan: Date; limit: number }): Promise<readonly { organizationId: string; messageId: string }[]> {
    const records = await this.prisma.currentClient().message.findMany({
      where: { status: MessageStatus.Pending, createdAt: { lt: input.olderThan } },
      select: { id: true, organizationId: true },
      orderBy: { createdAt: "asc" },
      take: input.limit,
    });
    return records.map((record) => ({ organizationId: record.organizationId, messageId: record.id }));
  }
}
