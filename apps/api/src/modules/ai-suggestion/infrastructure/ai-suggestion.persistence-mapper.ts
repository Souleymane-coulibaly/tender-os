import type { AiSuggestion as PrismaAiSuggestion } from "@prisma/client";
import type { AiSuggestionRecord } from "../application/ports/ai-suggestion.repository";

export function toAiSuggestionRecord(row: PrismaAiSuggestion): AiSuggestionRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    entityType: row.entityType,
    entityId: row.entityId,
    fieldName: row.fieldName,
    proposedValue: row.proposedValue,
    confidence: row.confidence,
    sourceDocumentId: row.sourceDocumentId,
    sourceDocumentVersionId: row.sourceDocumentVersionId,
    sourcePage: row.sourcePage,
    sourceChunkReference: row.sourceChunkReference,
    sourceAnalysisAttemptId: row.sourceAnalysisAttemptId,
    aiProvider: row.aiProvider,
    aiModel: row.aiModel,
    status: row.status,
    createdByProcess: row.createdByProcess,
    validatedByUserId: row.validatedByUserId,
    validatedAt: row.validatedAt,
    rejectedAt: row.rejectedAt,
    decisionReason: row.decisionReason,
    appliedValue: row.appliedValue,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
