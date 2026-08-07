import { z } from "zod";
import { DceDocumentCategory } from "../../domain/dce-document-category";

export const IdParamSchema = z.string().uuid();

const DCE_DOCUMENT_CATEGORY_VALUES = Object.values(DceDocumentCategory) as [DceDocumentCategory, ...DceDocumentCategory[]];

/** V2 Sprint 4 — correction utilisateur de la classification d'un fichier du DCE. */
export const CorrectDceDocumentCategoryBodySchema = z
  .object({
    category: z.enum(DCE_DOCUMENT_CATEGORY_VALUES),
    reason: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();
export type CorrectDceDocumentCategoryBody = z.infer<typeof CorrectDceDocumentCategoryBodySchema>;
