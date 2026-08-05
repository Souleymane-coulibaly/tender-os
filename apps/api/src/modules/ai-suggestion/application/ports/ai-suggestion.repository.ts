export type AiSuggestionRecord = Readonly<{
  id: string;
  organizationId: string;
  entityType: string;
  entityId: string;
  fieldName: string;
  proposedValue: unknown;
  confidence: number;
  sourceDocumentId: string | null;
  sourceDocumentVersionId: string | null;
  sourcePage: number | null;
  sourceChunkReference: string | null;
  sourceAnalysisAttemptId: string | null;
  aiProvider: string | null;
  aiModel: string | null;
  status: string;
  createdByProcess: string;
  validatedByUserId: string | null;
  validatedAt: Date | null;
  rejectedAt: Date | null;
  decisionReason: string | null;
  appliedValue: unknown;
  createdAt: Date;
  updatedAt: Date;
}>;

export type CreateAiSuggestionInput = Readonly<{
  id: string;
  organizationId: string;
  entityType: string;
  entityId: string;
  fieldName: string;
  proposedValue: unknown;
  confidence: number;
  sourceDocumentId?: string | undefined;
  sourceDocumentVersionId?: string | undefined;
  sourcePage?: number | undefined;
  sourceChunkReference?: string | undefined;
  sourceAnalysisAttemptId?: string | undefined;
  aiProvider?: string | undefined;
  aiModel?: string | undefined;
  createdByProcess: string;
  createdAt: Date;
}>;

export interface AiSuggestionRepository {
  create(input: CreateAiSuggestionInput): Promise<AiSuggestionRecord>;

  findById(input: { id: string; organizationId: string }): Promise<AiSuggestionRecord | null>;

  list(input: {
    organizationId: string;
    entityType?: string | undefined;
    entityId?: string | undefined;
    status?: string | undefined;
  }): Promise<AiSuggestionRecord[]>;

  /** Transition atomique gardée par `status = PENDING` (mission Sprint 1 §3) — retourne `null` si
   *  la suggestion n'était plus PENDING (déjà traitée par un autre acteur, race condition). */
  transitionFromPending(input: {
    id: string;
    organizationId: string;
    newStatus: string;
    validatedByUserId?: string | undefined;
    validatedAt?: Date | undefined;
    rejectedAt?: Date | undefined;
    decisionReason?: string | undefined;
    appliedValue?: unknown;
    updatedAt: Date;
  }): Promise<AiSuggestionRecord | null>;
}

export const AI_SUGGESTION_REPOSITORY = Symbol("AI_SUGGESTION_REPOSITORY");
