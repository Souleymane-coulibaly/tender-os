import { z } from "zod";

export const IdParamSchema = z.string().uuid();

const TENDER_STATUSES = [
  "DRAFT",
  "IN_ANALYSIS",
  "READY",
  "IN_PREPARATION",
  "READY_TO_SUBMIT",
  "SUBMITTED",
  "WON",
  "LOST",
  "ARCHIVED",
] as const;

export const CreateTenderBodySchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    reference: z.string().trim().min(1).max(255).optional(),
    buyerName: z.string().trim().min(1).max(300).optional(),
    description: z.string().trim().min(1).optional(),
    publicationDate: z.string().datetime().optional(),
    submissionDeadline: z.string().datetime().optional(),
    procedureType: z.string().trim().min(1).max(80).optional(),
    marketType: z.string().trim().min(1).max(80).optional(),
    estimatedAmount: z.string().trim().min(1).optional(),
    currency: z.string().trim().length(3).optional(),
    internalOwnerId: z.string().uuid().optional(),
    tags: z.array(z.string().trim().min(1).max(60)).optional(),
  })
  .strict();
export type CreateTenderBody = z.infer<typeof CreateTenderBodySchema>;

export const UpdateTenderBodySchema = CreateTenderBodySchema.partial();
export type UpdateTenderBody = z.infer<typeof UpdateTenderBodySchema>;

export const ChangeTenderStatusBodySchema = z
  .object({ status: z.enum(TENDER_STATUSES), reason: z.string().trim().min(1).max(500).optional() })
  .strict();
export type ChangeTenderStatusBody = z.infer<typeof ChangeTenderStatusBodySchema>;

export const ArchiveTenderBodySchema = z
  .object({ reason: z.string().trim().min(1).max(500).optional() })
  .strict()
  .default({});
export type ArchiveTenderBody = z.infer<typeof ArchiveTenderBodySchema>;

export const ListTendersQuerySchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    status: z.enum(TENDER_STATUSES).optional(),
    internalOwnerId: z.string().uuid().optional(),
    search: z.string().trim().min(1).max(200).optional(),
    deadlineBefore: z.string().datetime().optional(),
    sort: z.enum(["createdAt", "submissionDeadline", "title"]).optional(),
    sortDirection: z.enum(["asc", "desc"]).optional(),
  })
  .strict();
export type ListTendersQuery = z.infer<typeof ListTendersQuerySchema>;

export const CreateTenderLotBodySchema = z
  .object({
    lotNumber: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(500),
    description: z.string().trim().min(1).optional(),
    estimatedAmount: z.string().trim().min(1).optional(),
    currency: z.string().trim().length(3).optional(),
  })
  .strict();
export type CreateTenderLotBody = z.infer<typeof CreateTenderLotBodySchema>;
export const UpdateTenderLotBodySchema = CreateTenderLotBodySchema.omit({ lotNumber: true }).partial();
export type UpdateTenderLotBody = z.infer<typeof UpdateTenderLotBodySchema>;

export const CreateChecklistItemBodySchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().min(1).optional(),
    required: z.boolean().optional(),
    assignedTo: z.string().uuid().optional(),
    dueDate: z.string().datetime().optional(),
    displayOrder: z.number().int().min(0).optional(),
  })
  .strict();
export type CreateChecklistItemBody = z.infer<typeof CreateChecklistItemBodySchema>;
export const UpdateChecklistItemBodySchema = CreateChecklistItemBodySchema.extend({
  comment: z.string().trim().min(1).optional(),
}).partial();
export type UpdateChecklistItemBody = z.infer<typeof UpdateChecklistItemBodySchema>;
export const ChangeChecklistItemStatusBodySchema = z
  .object({ status: z.enum(["TODO", "IN_PROGRESS", "COMPLETED", "NOT_APPLICABLE"]) })
  .strict();
export type ChangeChecklistItemStatusBody = z.infer<typeof ChangeChecklistItemStatusBodySchema>;

export const CreateAwardCriterionBodySchema = z
  .object({
    name: z.string().trim().min(1).max(300),
    description: z.string().trim().min(1).optional(),
    weight: z.string().trim().min(1),
    parentCriterionId: z.string().uuid().optional(),
    displayOrder: z.number().int().min(0).optional(),
  })
  .strict();
export type CreateAwardCriterionBody = z.infer<typeof CreateAwardCriterionBodySchema>;
export const UpdateAwardCriterionBodySchema = CreateAwardCriterionBodySchema.omit({
  parentCriterionId: true,
}).partial();
export type UpdateAwardCriterionBody = z.infer<typeof UpdateAwardCriterionBodySchema>;

export const CreateRequestedDocumentBodySchema = z
  .object({
    name: z.string().trim().min(1).max(300),
    category: z.string().trim().min(1).max(100).optional(),
    documentType: z.string().trim().min(1).max(100).optional(),
    required: z.boolean().optional(),
    description: z.string().trim().min(1).optional(),
    expirationDate: z.string().datetime().optional(),
    displayOrder: z.number().int().min(0).optional(),
  })
  .strict();
export type CreateRequestedDocumentBody = z.infer<typeof CreateRequestedDocumentBodySchema>;
export const UpdateRequestedDocumentBodySchema = CreateRequestedDocumentBodySchema.extend({
  documentRef: z.string().uuid().optional(),
}).partial();
export type UpdateRequestedDocumentBody = z.infer<typeof UpdateRequestedDocumentBodySchema>;
export const ChangeRequestedDocumentStatusBodySchema = z
  .object({ status: z.enum(["PENDING", "PROVIDED", "VALIDATED", "REJECTED"]) })
  .strict();
export type ChangeRequestedDocumentStatusBody = z.infer<typeof ChangeRequestedDocumentStatusBodySchema>;

const MILESTONE_TYPES = [
  "SUBMISSION_DEADLINE",
  "QUESTION_DEADLINE",
  "MANDATORY_VISIT",
  "INTERNAL_VALIDATION",
  "CUSTOM",
] as const;
export const CreateMilestoneBodySchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().min(1).optional(),
    date: z.string().datetime(),
    type: z.enum(MILESTONE_TYPES),
    responsibleUserId: z.string().uuid().optional(),
  })
  .strict();
export type CreateMilestoneBody = z.infer<typeof CreateMilestoneBodySchema>;
export const UpdateMilestoneBodySchema = CreateMilestoneBodySchema.partial();
export type UpdateMilestoneBody = z.infer<typeof UpdateMilestoneBodySchema>;

export const CreateRiskBodySchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().min(1).optional(),
    severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    source: z.string().trim().min(1).max(120).optional(),
    assignedTo: z.string().uuid().optional(),
  })
  .strict();
export type CreateRiskBody = z.infer<typeof CreateRiskBodySchema>;
export const UpdateRiskBodySchema = CreateRiskBodySchema.extend({
  mitigation: z.string().trim().min(1).optional(),
}).partial();
export type UpdateRiskBody = z.infer<typeof UpdateRiskBodySchema>;
export const ChangeRiskStatusBodySchema = z
  .object({ status: z.enum(["OPEN", "MITIGATED", "RESOLVED", "ACCEPTED"]) })
  .strict();
export type ChangeRiskStatusBody = z.infer<typeof ChangeRiskStatusBodySchema>;

export const CreateAlertBodySchema = z
  .object({
    type: z.string().trim().min(1).max(60),
    severity: z.enum(["CRITICAL", "WARNING", "INFO"]),
    message: z.string().trim().min(1),
    source: z.string().trim().min(1).max(120).optional(),
  })
  .strict();
export type CreateAlertBody = z.infer<typeof CreateAlertBodySchema>;
