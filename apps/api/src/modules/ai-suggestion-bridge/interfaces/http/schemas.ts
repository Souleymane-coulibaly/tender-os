import { z } from "zod";
import { CONFLICT_RESOLUTIONS, type ConflictResolution } from "../../domain/conflict-resolution";

export const IdParamSchema = z.string().uuid();

const CONFLICT_RESOLUTION_VALUES = CONFLICT_RESOLUTIONS as [ConflictResolution, ...ConflictResolution[]];

export const ApplyAiSuggestionBodySchema = z
  .object({
    editedValue: z.unknown().optional(),
    conflictResolution: z.enum(CONFLICT_RESOLUTION_VALUES).optional(),
    reason: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();
export type ApplyAiSuggestionBody = z.infer<typeof ApplyAiSuggestionBodySchema>;

export const ListTenderSuggestionsQuerySchema = z
  .object({
    status: z.enum(["PENDING", "ACCEPTED", "MODIFIED", "REJECTED"]).optional(),
  })
  .strict();
export type ListTenderSuggestionsQuery = z.infer<typeof ListTenderSuggestionsQuerySchema>;
