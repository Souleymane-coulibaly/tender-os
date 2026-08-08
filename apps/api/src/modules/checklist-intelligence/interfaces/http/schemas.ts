import { z } from "zod";

export const IdParamSchema = z.string().uuid();

const DOCUMENT_MATCH_STATUSES = ["NOT_SEARCHED", "EXACT_MATCH", "PROBABLE_MATCH", "MULTIPLE_CANDIDATES", "NO_MATCH", "MANUALLY_ATTACHED"] as const;

export const AttachChecklistItemDocumentBodySchema = z
  .object({
    documentId: z.string().uuid(),
    documentVersionId: z.string().uuid().optional(),
    matchStatus: z.enum(DOCUMENT_MATCH_STATUSES).optional().default("MANUALLY_ATTACHED"),
    score: z.number().min(0).max(1).optional(),
    reasons: z.array(z.string()).optional(),
    expiresAt: z.string().datetime().optional(),
  })
  .strict();
export type AttachChecklistItemDocumentBody = z.infer<typeof AttachChecklistItemDocumentBodySchema>;
