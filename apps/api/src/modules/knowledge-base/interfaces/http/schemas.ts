import { z } from "zod";

export const IdParamSchema = z.string().uuid();
export const VersionNumberParamSchema = z.coerce.number().int().min(1);

export const CreateKnowledgeEntryBodySchema = z
  .object({
    title: z.string().min(1).max(500),
    description: z.string().max(5000).optional(),
    category: z.string().min(1),
    language: z.string().min(2).max(8).optional(),
    metadata: z.unknown().optional(),
    tags: z.array(z.string().min(1).max(60)).max(30).optional(),
    clientAccountId: z.string().uuid().optional(),
  })
  .strict();
export type CreateKnowledgeEntryBody = z.infer<typeof CreateKnowledgeEntryBodySchema>;

export const UpdateKnowledgeEntryBodySchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(5000).optional(),
    category: z.string().min(1).optional(),
    language: z.string().min(2).max(8).optional(),
    metadata: z.unknown().optional(),
  })
  .strict();
export type UpdateKnowledgeEntryBody = z.infer<typeof UpdateKnowledgeEntryBodySchema>;

export const ListKnowledgeEntriesQuerySchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    category: z.string().optional(),
    status: z.string().optional(),
    tagId: z.string().uuid().optional(),
    includeArchived: z.coerce.boolean().optional(),
    createdAfter: z.string().datetime().optional(),
    createdBefore: z.string().datetime().optional(),
    titleSearch: z.string().max(200).optional(),
    clientAccountId: z.union([z.string().uuid(), z.literal("GLOBAL")]).optional(),
    sort: z.enum(["createdAt", "updatedAt", "title"]).optional(),
    sortDirection: z.enum(["asc", "desc"]).optional(),
  })
  .strict();
export type ListKnowledgeEntriesQuery = z.infer<typeof ListKnowledgeEntriesQuerySchema>;

export const SearchKnowledgeBaseQuerySchema = z
  .object({
    query: z.string().min(1).max(200),
    category: z.string().optional(),
    tagId: z.string().uuid().optional(),
    status: z.string().optional(),
    includeArchived: z.coerce.boolean().optional(),
    createdAfter: z.string().datetime().optional(),
    createdBefore: z.string().datetime().optional(),
    clientAccountId: z.union([z.string().uuid(), z.literal("GLOBAL")]).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    offset: z.coerce.number().int().min(0).optional().default(0),
  })
  .strict();
export type SearchKnowledgeBaseQuery = z.infer<typeof SearchKnowledgeBaseQuerySchema>;

/** Corps multipart (mission §6) — les champs texte arrivent en chaînes (Multer) : `metadata` est
 *  une chaîne JSON encore non parsée, `tags` une liste séparée par des virgules, validées/parsées
 *  par le contrôleur avant d'atteindre le use case. */
export const AddKnowledgeDocumentBodySchema = z
  .object({
    knowledgeEntryId: z.string().uuid().optional(),
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(5000).optional(),
    category: z.string().min(1).optional(),
    language: z.string().min(2).max(8).optional(),
    metadata: z.string().optional(),
    tags: z.string().optional(),
    clientAccountId: z.string().uuid().optional(),
  })
  .strict();
export type AddKnowledgeDocumentBody = z.infer<typeof AddKnowledgeDocumentBodySchema>;

export const AddKnowledgeTagBodySchema = z.object({ label: z.string().min(1).max(60) }).strict();
export type AddKnowledgeTagBody = z.infer<typeof AddKnowledgeTagBodySchema>;
