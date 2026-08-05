import type { AiSuggestionRecord } from "./ports/ai-suggestion.repository";

export type AiSuggestionSummary = Readonly<{
  id: string;
  organizationId: string;
  entityType: string;
  entityId: string;
  fieldName: string;
  proposedValue: unknown;
  confidence: number;
  sourceDocumentId: string | undefined;
  sourceDocumentVersionId: string | undefined;
  sourcePage: number | undefined;
  sourceChunkReference: string | undefined;
  sourceAnalysisAttemptId: string | undefined;
  aiProvider: string | undefined;
  aiModel: string | undefined;
  status: string;
  createdByProcess: string;
  validatedByUserId: string | undefined;
  validatedAt: string | undefined;
  rejectedAt: string | undefined;
  decisionReason: string | undefined;
  appliedValue: unknown;
  createdAt: string;
  updatedAt: string;
}>;

export function toAiSuggestionSummary(record: AiSuggestionRecord): AiSuggestionSummary {
  return {
    id: record.id,
    organizationId: record.organizationId,
    entityType: record.entityType,
    entityId: record.entityId,
    fieldName: record.fieldName,
    proposedValue: record.proposedValue,
    confidence: record.confidence,
    sourceDocumentId: record.sourceDocumentId ?? undefined,
    sourceDocumentVersionId: record.sourceDocumentVersionId ?? undefined,
    sourcePage: record.sourcePage ?? undefined,
    sourceChunkReference: record.sourceChunkReference ?? undefined,
    sourceAnalysisAttemptId: record.sourceAnalysisAttemptId ?? undefined,
    aiProvider: record.aiProvider ?? undefined,
    aiModel: record.aiModel ?? undefined,
    status: record.status,
    createdByProcess: record.createdByProcess,
    validatedByUserId: record.validatedByUserId ?? undefined,
    validatedAt: record.validatedAt?.toISOString() ?? undefined,
    rejectedAt: record.rejectedAt?.toISOString() ?? undefined,
    decisionReason: record.decisionReason ?? undefined,
    appliedValue: record.appliedValue ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
