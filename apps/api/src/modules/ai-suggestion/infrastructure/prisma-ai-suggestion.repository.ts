import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { AiSuggestionStatus } from "../domain/ai-suggestion-status";
import type { AiSuggestionRecord, AiSuggestionRepository, CreateAiSuggestionInput } from "../application/ports/ai-suggestion.repository";
import { toAiSuggestionRecord } from "./ai-suggestion.persistence-mapper";

@Injectable()
export class PrismaAiSuggestionRepository implements AiSuggestionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateAiSuggestionInput): Promise<AiSuggestionRecord> {
    const created = await this.prisma.aiSuggestion.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        entityType: input.entityType,
        entityId: input.entityId,
        fieldName: input.fieldName,
        proposedValue: input.proposedValue as Prisma.InputJsonValue,
        confidence: input.confidence,
        sourceDocumentId: input.sourceDocumentId ?? null,
        sourceDocumentVersionId: input.sourceDocumentVersionId ?? null,
        sourcePage: input.sourcePage ?? null,
        sourceChunkReference: input.sourceChunkReference ?? null,
        sourceAnalysisAttemptId: input.sourceAnalysisAttemptId ?? null,
        aiProvider: input.aiProvider ?? null,
        aiModel: input.aiModel ?? null,
        status: AiSuggestionStatus.Pending,
        createdByProcess: input.createdByProcess,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      },
    });

    return toAiSuggestionRecord(created);
  }

  async findById(input: { id: string; organizationId: string }): Promise<AiSuggestionRecord | null> {
    const found = await this.prisma.aiSuggestion.findFirst({ where: { id: input.id, organizationId: input.organizationId } });
    return found ? toAiSuggestionRecord(found) : null;
  }

  async list(input: { organizationId: string; entityType?: string; entityId?: string; status?: string }): Promise<AiSuggestionRecord[]> {
    const rows = await this.prisma.aiSuggestion.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.entityType ? { entityType: input.entityType } : {}),
        ...(input.entityId ? { entityId: input.entityId } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    return rows.map(toAiSuggestionRecord);
  }

  async transitionFromPending(input: {
    id: string;
    organizationId: string;
    newStatus: string;
    validatedByUserId?: string | undefined;
    validatedAt?: Date | undefined;
    rejectedAt?: Date | undefined;
    decisionReason?: string | undefined;
    appliedValue?: unknown;
    updatedAt: Date;
  }): Promise<AiSuggestionRecord | null> {
    // Garde applicative atomique (mission Sprint 1 §3) — équivalent au pattern de concurrence
    // optimiste déjà utilisé ailleurs dans le projet (updateMany + count check), ici gardé par
    // `status = PENDING` plutôt que par une colonne `version`.
    const result = await this.prisma.aiSuggestion.updateMany({
      where: { id: input.id, organizationId: input.organizationId, status: AiSuggestionStatus.Pending },
      data: {
        status: input.newStatus,
        validatedByUserId: input.validatedByUserId ?? null,
        validatedAt: input.validatedAt ?? null,
        rejectedAt: input.rejectedAt ?? null,
        decisionReason: input.decisionReason ?? null,
        ...(input.appliedValue !== undefined ? { appliedValue: input.appliedValue as Prisma.InputJsonValue } : {}),
        updatedAt: input.updatedAt,
      },
    });

    if (result.count !== 1) {
      return null;
    }

    return this.findById({ id: input.id, organizationId: input.organizationId });
  }
}
