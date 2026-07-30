import { z } from "zod";

export const IdParamSchema = z.string().uuid();

export const TENDER_STATUSES = [
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

// Mission architecture §5 — ensembles minimaux préparant le multi-pays/multi-source, alignés sur
// domain/market-type.ts, domain/tender-country.ts, domain/tender-language.ts, domain/tender-source.ts.
export const MARKET_TYPES = ["PUBLIC", "PRIVATE"] as const;
export const TENDER_COUNTRIES = ["FR", "BE", "DE", "ES", "IT", "LU", "NL", "EU", "OTHER"] as const;
export const TENDER_LANGUAGES = ["fr", "en", "de", "es", "it", "nl"] as const;
export const TENDER_SOURCES = ["MANUAL", "BOAMP", "TED", "PRIVATE", "OTHER"] as const;

const TenderDetailsBodySchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    reference: z.string().trim().min(1).max(255).optional(),
    buyerName: z.string().trim().min(1).max(300).optional(),
    description: z.string().trim().min(1).optional(),
    publicationDate: z.string().datetime().optional(),
    submissionDeadline: z.string().datetime().optional(),
    procedureType: z.string().trim().min(1).max(80).optional(),
    marketType: z.enum(MARKET_TYPES).optional(),
    country: z.enum(TENDER_COUNTRIES).optional(),
    language: z.enum(TENDER_LANGUAGES).optional(),
    source: z.enum(TENDER_SOURCES).optional(),
    externalReference: z.string().trim().min(1).max(255).optional(),
    sourceUrl: z.string().trim().url().max(2048).optional(),
    estimatedAmount: z.string().trim().min(1).optional(),
    currency: z.string().trim().length(3).optional(),
    internalOwnerId: z.string().uuid().optional(),
    tags: z.array(z.string().trim().min(1).max(60)).optional(),
  })
  .strict();

// Mission Sprint 5.1 §"Tenders" — un client autorisé est obligatoire à la création, jamais
// modifiable ensuite (§"changer le client d'un appel d'offres... interdit dans ce sprint") :
// `clientAccountId` n'existe QUE sur le schéma de création, `.strict()` sur `UpdateTenderBodySchema`
// rejette explicitement toute tentative d'en glisser un dans une modification.
export const CreateTenderBodySchema = TenderDetailsBodySchema.extend({ clientAccountId: z.string().uuid() });
export type CreateTenderBody = z.infer<typeof CreateTenderBodySchema>;

export const UpdateTenderBodySchema = TenderDetailsBodySchema.partial();
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
    clientAccountId: z.string().uuid().optional(),
    search: z.string().trim().min(1).max(200).optional(),
    deadlineAfter: z.string().datetime().optional(),
    deadlineBefore: z.string().datetime().optional(),
    overdue: z.coerce.boolean().optional(),
    sort: z.enum(["createdAt", "submissionDeadline", "title", "updatedAt"]).optional(),
    sortDirection: z.enum(["asc", "desc"]).optional(),
  })
  .strict();
export type ListTendersQuery = z.infer<typeof ListTendersQuerySchema>;

export const TenderBoardQuerySchema = z
  .object({
    search: z.string().trim().min(1).max(200).optional(),
    internalOwnerId: z.string().uuid().optional(),
    clientAccountId: z.string().uuid().optional(),
    limitPerColumn: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();
export type TenderBoardQuery = z.infer<typeof TenderBoardQuerySchema>;

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
export const RestoreTenderLotBodySchema = z.object({}).strict().default({});
export type RestoreTenderLotBody = z.infer<typeof RestoreTenderLotBodySchema>;
// displayOrder n'est jamais accepté par Create/Update (conception Lots §D) — seul ce schéma,
// dédié au réordonnancement, en modifie la valeur, via la liste complète et ordonnée des lots actifs.
export const ReorderTenderLotsBodySchema = z.object({ lotIds: z.array(z.string().uuid()).min(1) }).strict();
export type ReorderTenderLotsBody = z.infer<typeof ReorderTenderLotsBodySchema>;

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
