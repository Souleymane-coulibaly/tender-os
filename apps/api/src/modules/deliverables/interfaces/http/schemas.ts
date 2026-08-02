import { z } from "zod";
import { ChecklistPieceStatus } from "../../domain/checklist-piece-status";
import { ComplianceCoverageStatus, Criticality } from "../../domain/compliance-coverage-status";
import { DeliverableReviewDecision } from "../../domain/deliverable-review-decision";
import { DeliverableType } from "../../domain/deliverable-type";
import { ScopeLevel } from "../../domain/scope-level";
import { TemplateSectionRequirement } from "../../domain/template-section-requirement";

export const IdParamSchema = z.string().uuid();

/**
 * Mission Sprint 8A.1 §20/§9 — validation de FORME ici (shape Zod), validation métier profonde
 * (kinds fermés, `href` http(s) uniquement, longueurs) dans `validateDeliverableContentBlocks`
 * (domaine) — même répartition que `config: z.record(...)` pour Export/Template (Sprint 8A/6).
 */
const ContentBlockSchema = z.record(z.string(), z.unknown());

export const UpdateDeliverableSectionBodySchema = z
  .object({
    locked: z.boolean().optional(),
    hidden: z.boolean().optional(),
  })
  .strict();
export type UpdateDeliverableSectionBody = z.infer<typeof UpdateDeliverableSectionBodySchema>;

export const CreateManualRevisionBodySchema = z
  .object({
    content: z.array(ContentBlockSchema).min(1).max(500),
    changeNote: z.string().max(2000).optional(),
  })
  .strict();
export type CreateManualRevisionBody = z.infer<typeof CreateManualRevisionBodySchema>;

export const CreateRevisionFromGenerationBodySchema = z
  .object({
    generationId: z.string().uuid(),
    changeNote: z.string().max(2000).optional(),
  })
  .strict();
export type CreateRevisionFromGenerationBody = z.infer<typeof CreateRevisionFromGenerationBodySchema>;

export const SaveRevisionDraftBodySchema = z
  .object({
    content: z.array(ContentBlockSchema).min(1).max(500),
    expectedEditVersion: z.number().int().nonnegative(),
    changeNote: z.string().max(2000).optional(),
  })
  .strict();
export type SaveRevisionDraftBody = z.infer<typeof SaveRevisionDraftBodySchema>;

export const DecideRevisionReviewBodySchema = z
  .object({
    decision: z.enum([DeliverableReviewDecision.Approved, DeliverableReviewDecision.ChangesRequested, DeliverableReviewDecision.Rejected]),
    comment: z.string().max(5000).optional(),
  })
  .strict();
export type DecideRevisionReviewBody = z.infer<typeof DecideRevisionReviewBodySchema>;

export const SelectRevisionForExportBodySchema = z
  .object({ justification: z.string().max(2000).optional() })
  .strict();
export type SelectRevisionForExportBody = z.infer<typeof SelectRevisionForExportBodySchema>;

export const RestoreRevisionBodySchema = z.object({ sourceRevisionId: z.string().uuid() }).strict();
export type RestoreRevisionBody = z.infer<typeof RestoreRevisionBodySchema>;

export const GenerateSectionBodySchema = z.object({ taskType: z.string().max(40).optional() }).strict();
export type GenerateSectionBody = z.infer<typeof GenerateSectionBodySchema>;

export const CompareRevisionsQuerySchema = z
  .object({ fromRevisionId: z.string().uuid(), toRevisionId: z.string().uuid() })
  .strict();
export type CompareRevisionsQuery = z.infer<typeof CompareRevisionsQuerySchema>;

export const AddDeliverableCommentBodySchema = z
  .object({
    content: z.string().min(1).max(5000),
    deliverableSectionId: z.string().uuid().optional(),
    deliverableRevisionId: z.string().uuid().optional(),
  })
  .strict();
export type AddDeliverableCommentBody = z.infer<typeof AddDeliverableCommentBodySchema>;

const ScopeLevelSchema = z.enum([ScopeLevel.Tender, ScopeLevel.Client, ScopeLevel.Organization]);
const DocumentTypeSchema = z.enum(Object.values(DeliverableType) as [string, ...string[]]);

const TemplateSectionSchema = z
  .object({
    code: z.string().min(1).max(80),
    title: z.string().min(1).max(300),
    description: z.string().max(5000).optional(),
    order: z.number().int().nonnegative(),
    headingLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    requirement: z.enum([TemplateSectionRequirement.Mandatory, TemplateSectionRequirement.Optional, TemplateSectionRequirement.Conditional]).optional(),
    displayCondition: z.string().max(500).optional(),
    recommendedLength: z.number().int().nonnegative().optional(),
    maxCharacters: z.number().int().nonnegative().optional(),
    maxPages: z.number().int().nonnegative().optional(),
    instructions: z.string().max(5000).optional(),
    styleHint: z.string().max(200).optional(),
    taskType: z.string().max(40).optional(),
    allowedVariables: z.array(z.string()).optional(),
    validationRequired: z.boolean().optional(),
    pageBreakBefore: z.boolean().optional(),
  })
  .strict();

export const CreateDeliverableTemplateBodySchema = z
  .object({
    scopeLevel: ScopeLevelSchema,
    clientAccountId: z.string().uuid().optional(),
    tenderId: z.string().uuid().optional(),
    documentType: DocumentTypeSchema,
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    note: z.string().max(2000).optional(),
    sections: z.array(TemplateSectionSchema).min(1).max(100),
  })
  .strict();
export type CreateDeliverableTemplateBody = z.infer<typeof CreateDeliverableTemplateBodySchema>;

export const CreateDeliverableTemplateVersionBodySchema = z.object({ sections: z.array(TemplateSectionSchema).min(1).max(100) }).strict();
export type CreateDeliverableTemplateVersionBody = z.infer<typeof CreateDeliverableTemplateVersionBodySchema>;

export const CreateDocumentThemeBodySchema = z
  .object({
    scopeLevel: ScopeLevelSchema,
    clientAccountId: z.string().uuid().optional(),
    tenderId: z.string().uuid().optional(),
    name: z.string().min(1).max(200),
    logoStorageKey: z.string().max(500).optional(),
    accentColor: z.string().max(7).optional(),
    fontFamily: z.string().max(100).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type CreateDocumentThemeBody = z.infer<typeof CreateDocumentThemeBodySchema>;

export const CreateDocumentThemeVersionBodySchema = z
  .object({
    logoStorageKey: z.string().max(500).optional(),
    accentColor: z.string().max(7).optional(),
    fontFamily: z.string().max(100).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type CreateDocumentThemeVersionBody = z.infer<typeof CreateDocumentThemeVersionBodySchema>;

export const CreateComplianceMatrixEntryBodySchema = z
  .object({
    requirementId: z.string().uuid().optional(),
    source: z.string().min(1).max(300),
    mandatory: z.boolean(),
    criticality: z.enum([Criticality.Low, Criticality.Medium, Criticality.High, Criticality.Critical]),
  })
  .strict();
export type CreateComplianceMatrixEntryBody = z.infer<typeof CreateComplianceMatrixEntryBodySchema>;

export const UpdateComplianceMatrixEntryBodySchema = z
  .object({
    response: z.string().max(20_000).optional(),
    deliverableSectionRef: z.string().max(80).optional(),
    proofReference: z.string().max(2000).optional(),
    coverageStatus: z
      .enum([ComplianceCoverageStatus.Covered, ComplianceCoverageStatus.PartiallyCovered, ComplianceCoverageStatus.NotCovered, ComplianceCoverageStatus.NotApplicable, ComplianceCoverageStatus.ToConfirm])
      .optional(),
  })
  .strict();
export type UpdateComplianceMatrixEntryBody = z.infer<typeof UpdateComplianceMatrixEntryBodySchema>;

export const CreateChecklistPieceEntryBodySchema = z
  .object({
    name: z.string().min(1).max(300),
    source: z.string().max(300).optional(),
    mandatory: z.boolean(),
    format: z.string().max(60).optional(),
    signatureRequired: z.boolean().optional(),
  })
  .strict();
export type CreateChecklistPieceEntryBody = z.infer<typeof CreateChecklistPieceEntryBodySchema>;

export const UpdateChecklistPieceEntryBodySchema = z
  .object({
    documentId: z.string().uuid().optional(),
    version: z.string().max(40).optional(),
    expiresAt: z.coerce.date().optional(),
    status: z.enum([ChecklistPieceStatus.Missing, ChecklistPieceStatus.Provided, ChecklistPieceStatus.Expired, ChecklistPieceStatus.Rejected, ChecklistPieceStatus.Valid]).optional(),
    responsibleUserId: z.string().uuid().optional(),
  })
  .strict();
export type UpdateChecklistPieceEntryBody = z.infer<typeof UpdateChecklistPieceEntryBodySchema>;

/** Correctif audit Codex P1-002 — fige explicitement la version Sprint 7 utilisée par le rapport
 *  financier ; jamais un `documentId`/version implicite. */
export const SelectCostReportEstimateBodySchema = z
  .object({
    pricingEstimateId: z.string().uuid(),
    versionNumber: z.number().int().positive(),
  })
  .strict();
export type SelectCostReportEstimateBody = z.infer<typeof SelectCostReportEstimateBodySchema>;

export const CreateDeliverableAnnexBodySchema = z
  .object({
    label: z.string().min(1).max(300),
    source: z.string().max(300).optional(),
    documentId: z.string().uuid().optional(),
    version: z.string().max(40).optional(),
  })
  .strict();
export type CreateDeliverableAnnexBody = z.infer<typeof CreateDeliverableAnnexBodySchema>;
