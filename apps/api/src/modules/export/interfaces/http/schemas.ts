import { z } from "zod";
import { ExportDocumentType } from "../../domain/export-document-type";
import { ExportFormat } from "../../domain/export-format";
import { ExportSectionSource } from "../../domain/export-section-source";

export const IdParamSchema = z.string().uuid();

const DocumentTypeSchema = z.enum([
  ExportDocumentType.TechnicalMemo,
  ExportDocumentType.ExecutiveSummary,
  ExportDocumentType.ComplianceMatrix,
  ExportDocumentType.Checklist,
  ExportDocumentType.ValidationReport,
  ExportDocumentType.CostReport,
  ExportDocumentType.SignaturePackage,
]);

const FormatSchema = z.enum([ExportFormat.Docx, ExportFormat.Pdf]);

export const CreateExportTemplateBodySchema = z
  .object({
    documentType: DocumentTypeSchema,
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    format: FormatSchema,
    config: z.record(z.string(), z.unknown()),
  })
  .strict();
export type CreateExportTemplateBody = z.infer<typeof CreateExportTemplateBodySchema>;

export const CreateExportTemplateVersionBodySchema = z
  .object({
    format: FormatSchema,
    config: z.record(z.string(), z.unknown()),
  })
  .strict();
export type CreateExportTemplateVersionBody = z.infer<typeof CreateExportTemplateVersionBodySchema>;

const SectionSelectionSchema = z
  .object({
    sectionId: z.string().min(1).max(100),
    sourceType: z.enum([ExportSectionSource.Generation, ExportSectionSource.Pricing, ExportSectionSource.Manual, ExportSectionSource.Annex]),
    taskType: z.string().max(40).optional(),
    generationId: z.string().uuid().optional(),
    pricingEstimateId: z.string().uuid().optional(),
    pricingEstimateVersionNumber: z.number().int().positive().optional(),
    manualContent: z.string().max(50_000).optional(),
    notes: z.string().max(1000).optional(),
  })
  .strict();

export const PreviewExportBodySchema = z
  .object({
    exportTemplateId: z.string().uuid(),
    sections: z.array(SectionSelectionSchema).min(1).max(200),
  })
  .strict();
export type PreviewExportBody = z.infer<typeof PreviewExportBodySchema>;

export const ListExportHistoryQuerySchema = z
  .object({
    mode: z.enum(["PREVIEW", "FINAL"]).optional(),
    limit: z.coerce.number().int().positive().max(100).default(20),
    offset: z.coerce.number().int().nonnegative().default(0),
  })
  .strict();
export type ListExportHistoryQuery = z.infer<typeof ListExportHistoryQuerySchema>;
