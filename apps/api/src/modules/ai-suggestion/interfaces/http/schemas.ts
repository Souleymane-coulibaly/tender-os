import { z } from "zod";
import { AI_SUGGESTION_ENTITY_TYPES } from "../../domain/ai-suggestion-entity-type";
import { AiSuggestionStatus } from "../../domain/ai-suggestion-status";

export const IdParamSchema = z.string().uuid();

const ENTITY_TYPE_VALUES = AI_SUGGESTION_ENTITY_TYPES as [string, ...string[]];
const STATUS_VALUES = Object.values(AiSuggestionStatus) as [AiSuggestionStatus, ...AiSuggestionStatus[]];

export const ListAiSuggestionsQuerySchema = z
  .object({
    entityType: z.enum(ENTITY_TYPE_VALUES).optional(),
    entityId: z.string().uuid().optional(),
    status: z.enum(STATUS_VALUES).optional(),
  })
  .strict();
export type ListAiSuggestionsQuery = z.infer<typeof ListAiSuggestionsQuerySchema>;

export const ModifyAiSuggestionBodySchema = z
  .object({
    editedValue: z.unknown(),
    reason: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();
export type ModifyAiSuggestionBody = z.infer<typeof ModifyAiSuggestionBodySchema>;

export const RejectAiSuggestionBodySchema = z
  .object({
    reason: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();
export type RejectAiSuggestionBody = z.infer<typeof RejectAiSuggestionBodySchema>;
