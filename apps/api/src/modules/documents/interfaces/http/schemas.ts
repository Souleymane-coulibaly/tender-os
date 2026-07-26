import { z } from "zod";

export const IdParamSchema = z.string().uuid();

export const DOCUMENT_ORIGINS = ["USER_UPLOAD", "DCE", "TEMPLATE", "GENERATED", "IMPORTED"] as const;
export const DOCUMENT_DOMAINS = ["TENDER", "ORGANIZATION", "KNOWLEDGE", "TEMPLATE", "GENERATED"] as const;
export const DOCUMENT_STATUSES = ["ACTIVE", "ARCHIVED"] as const;

/** Champs texte d'un upload multipart/form-data — toujours des chaînes côté multer, même
 *  pour un champ conceptuellement optionnel absent (undefined dans ce cas). */
export const CreateDocumentBodySchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    description: z.string().trim().min(1).optional(),
    origin: z.enum(DOCUMENT_ORIGINS),
    domain: z.enum(DOCUMENT_DOMAINS),
    category: z.string().trim().min(1).max(100).optional(),
  })
  .strict();
export type CreateDocumentBody = z.infer<typeof CreateDocumentBodySchema>;

export const AddDocumentVersionBodySchema = z.object({}).strict();
export type AddDocumentVersionBody = z.infer<typeof AddDocumentVersionBodySchema>;

export const UpdateDocumentMetadataBodySchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    description: z.string().trim().min(1),
    domain: z.enum(DOCUMENT_DOMAINS),
    category: z.string().trim().min(1).max(100),
  })
  .partial()
  .strict();
export type UpdateDocumentMetadataBody = z.infer<typeof UpdateDocumentMetadataBodySchema>;

export const ArchiveDocumentBodySchema = z.object({}).strict().default({});
export type ArchiveDocumentBody = z.infer<typeof ArchiveDocumentBodySchema>;

export const ListDocumentsQuerySchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    status: z.enum(DOCUMENT_STATUSES).optional(),
    origin: z.enum(DOCUMENT_ORIGINS).optional(),
    domain: z.enum(DOCUMENT_DOMAINS).optional(),
    createdByUserId: z.string().uuid().optional(),
    search: z.string().trim().min(1).max(200).optional(),
    sort: z.enum(["createdAt", "updatedAt", "title", "sizeBytes", "currentVersionNumber"]).optional(),
    sortDirection: z.enum(["asc", "desc"]).optional(),
  })
  .strict();
export type ListDocumentsQuery = z.infer<typeof ListDocumentsQuerySchema>;

export const DownloadVersionQuerySchema = z.object({}).strict();
