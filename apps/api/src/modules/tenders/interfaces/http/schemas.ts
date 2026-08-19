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

// V2 Sprint 3 §6 — informations générales enrichies (~35 champs de la mission), toutes optionnelles
// (mission "ne jamais bloquer la création d'un Tender incomplet"). §5 : `buyerId` référence un
// `Buyer` existant (résolu/validé côté use-case), distinct de `buyerName` (V1, conservé).
export const AWARD_TYPES = ["MONO_AWARDEE", "MULTI_AWARDEE"] as const;

const TenderDetailsBodySchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    reference: z.string().trim().min(1).max(255).optional(),
    buyerName: z.string().trim().min(1).max(300).optional(),
    buyerId: z.string().uuid().optional(),
    description: z.string().trim().min(1).optional(),
    publicationDate: z.string().datetime().optional(),
    submissionDeadline: z.string().datetime().optional(),
    submissionDeadlineTimezone: z.string().trim().min(1).max(80).optional(),
    questionsDeadline: z.string().datetime().optional(),
    visitDate: z.string().datetime().optional(),
    visitMandatory: z.boolean().optional(),
    contractDurationMonths: z.number().int().min(0).optional(),
    renewalDurationMonths: z.number().int().min(0).optional(),
    renewalCount: z.number().int().min(0).optional(),
    estimatedStartDate: z.string().datetime().optional(),
    executionLocation: z.string().trim().min(1).max(300).optional(),
    geographicZone: z.string().trim().min(1).max(300).optional(),
    isFrameworkAgreement: z.boolean().optional(),
    awardType: z.enum(AWARD_TYPES).optional(),
    variantsAllowed: z.boolean().optional(),
    pseAllowed: z.boolean().optional(),
    electronicResponseMandatory: z.boolean().optional(),
    signatureRequired: z.boolean().optional(),
    submissionPlatformUrl: z.string().trim().url().max(2048).optional(),
    internalNotes: z.string().trim().min(1).optional(),
    procedureType: z.string().trim().min(1).max(80).optional(),
    marketType: z.enum(MARKET_TYPES).optional(),
    country: z.enum(TENDER_COUNTRIES).optional(),
    language: z.enum(TENDER_LANGUAGES).optional(),
    source: z.enum(TENDER_SOURCES).optional(),
    externalReference: z.string().trim().min(1).max(255).optional(),
    sourceUrl: z.string().trim().url().max(2048).optional(),
    estimatedAmount: z.string().trim().min(1).optional(),
    minimumAmount: z.string().trim().min(1).optional(),
    maximumAmount: z.string().trim().min(1).optional(),
    currency: z.string().trim().length(3).optional(),
    internalOwnerId: z.string().uuid().optional(),
    tags: z.array(z.string().trim().min(1).max(60)).optional(),
  })
  .strict();

// Mission Sprint 5.1 §"Tenders" — un client autorisé est obligatoire à la création, jamais
// modifiable ensuite (§"changer le client d'un appel d'offres... interdit dans ce sprint") :
// `clientAccountId` n'existe QUE sur le schéma de création, `.strict()` sur `UpdateTenderBodySchema`
// rejette explicitement toute tentative d'en glisser un dans une modification.
// V2 Sprint 26 (Checkpoint 2.1-A3) — `candidateCompanyId` optionnel à la création (mission §16 "ne
// pas inventer le moment où elle devient obligatoire"), jamais modifiable ensuite via `PATCH`
// (même discipline que `clientAccountId` — voir `ChangeTenderCandidateCompanyBodySchema` ci-dessous).
export const CreateTenderBodySchema = TenderDetailsBodySchema.extend({ clientAccountId: z.string().uuid(), candidateCompanyId: z.string().uuid().optional() });
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

export const RestoreTenderBodySchema = z
  .object({ reason: z.string().trim().min(1).max(500).optional() })
  .strict()
  .default({});
export type RestoreTenderBody = z.infer<typeof RestoreTenderBodySchema>;

// V2 Sprint 3 §4 — jamais fusionné avec UpdateTenderBodySchema : changement contrôlé, distinct de
// la mise à jour des informations générales (permission dédiée `ChangeTenderCandidate`).
export const ChangeTenderCandidateBodySchema = z
  .object({ clientAccountId: z.string().uuid(), reason: z.string().trim().min(1).max(500).optional() })
  .strict();
export type ChangeTenderCandidateBody = z.infer<typeof ChangeTenderCandidateBodySchema>;

// V2 Sprint 26 (Checkpoint 2.1-A3) — distinct de `ChangeTenderCandidateBodySchema` ci-dessus
// (`clientAccountId`, contexte client/portefeuille legacy) : celui-ci gouverne `candidateCompanyId`,
// l'entreprise juridique répondante (SOT `CandidateCompany`). Jamais fusionné avec
// `UpdateTenderBodySchema` — même discipline "changement contrôlé, permission dédiée".
export const ChangeTenderCandidateCompanyBodySchema = z
  .object({ candidateCompanyId: z.string().uuid(), reason: z.string().trim().min(1).max(500).optional() })
  .strict();
export type ChangeTenderCandidateCompanyBody = z.infer<typeof ChangeTenderCandidateCompanyBodySchema>;

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
    code: z.string().trim().min(1).max(80).optional(),
    cpvMain: z.string().trim().min(1).max(20).optional(),
    cpvSecondary: z.array(z.string().trim().min(1).max(20)).optional(),
    executionLocation: z.string().trim().min(1).max(300).optional(),
    durationMonths: z.number().int().min(0).optional(),
    estimatedStartDate: z.string().datetime().optional(),
    minimumAmount: z.string().trim().min(1).optional(),
    maximumAmount: z.string().trim().min(1).optional(),
    selectedForResponse: z.boolean().optional(),
    soloAllowed: z.boolean().optional(),
    groupAllowed: z.boolean().optional(),
    variantsAllowed: z.boolean().optional(),
    pseAllowed: z.boolean().optional(),
    specificVisitRequired: z.boolean().optional(),
    specificVisitDate: z.string().datetime().optional(),
    internalNotes: z.string().trim().min(1).optional(),
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

// V2 Sprint 6 §5-8/§13-15 — catalogues gouvernés, doivent rester synchronisés avec
// `tenders/domain/checklist-item.entity.ts`.
export const CHECKLIST_ITEM_TYPES = [
  "ADMINISTRATIVE_DOCUMENT",
  "TECHNICAL_DOCUMENT",
  "FINANCIAL_DOCUMENT",
  "CERTIFICATION",
  "INSURANCE",
  "DECLARATION",
  "FORM",
  "SIGNATURE",
  "VISIT",
  "REFERENCE",
  "TECHNICAL_REQUIREMENT",
  "FINANCIAL_REQUIREMENT",
  "DEADLINE",
  "DELIVERABLE",
  "OTHER",
] as const;
export const CHECKLIST_REQUIREMENT_LEVELS = ["MANDATORY", "CONDITIONAL", "INFORMATIONAL"] as const;
export const CHECKLIST_ITEM_CRITICALITIES = ["BLOCKING", "HIGH", "MEDIUM", "LOW"] as const;
export const CHECKLIST_COMPLIANCE_STATUSES = ["TO_REVIEW", "NON_COMPLIANT", "READY", "VALIDATED", "NOT_APPLICABLE"] as const;
export const CHECKLIST_SUBJECT_TYPES = ["CANDIDATE", "GROUP_MEMBER", "SUBCONTRACTOR", "ANY_MEMBER", "TENDER", "LOT"] as const;

export const CreateChecklistItemBodySchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().min(1).optional(),
    required: z.boolean().optional(),
    assignedTo: z.string().uuid().optional(),
    dueDate: z.string().datetime().optional(),
    displayOrder: z.number().int().min(0).optional(),
    type: z.enum(CHECKLIST_ITEM_TYPES).optional(),
    requirementLevel: z.enum(CHECKLIST_REQUIREMENT_LEVELS).optional(),
    conditionText: z.string().trim().min(1).optional(),
    criticality: z.enum(CHECKLIST_ITEM_CRITICALITIES).optional(),
    subjectType: z.enum(CHECKLIST_SUBJECT_TYPES).optional(),
    subjectSubcontractorProfileId: z.string().uuid().optional(),
    lotId: z.string().uuid().optional(),
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

export const ListChecklistItemsQuerySchema = z
  .object({
    lotId: z.string().uuid().optional(),
    complianceStatus: z.enum(CHECKLIST_COMPLIANCE_STATUSES).optional(),
    criticality: z.enum(CHECKLIST_ITEM_CRITICALITIES).optional(),
    requirementLevel: z.enum(CHECKLIST_REQUIREMENT_LEVELS).optional(),
    subjectType: z.enum(CHECKLIST_SUBJECT_TYPES).optional(),
    blockingOnly: z.coerce.boolean().optional(),
    missingOnly: z.coerce.boolean().optional(),
    expiredOnly: z.coerce.boolean().optional(),
  })
  .strict();
export type ListChecklistItemsQuery = z.infer<typeof ListChecklistItemsQuerySchema>;

export const AWARD_CRITERION_TYPES = ["PRICE", "TECHNICAL_VALUE", "DELAY", "ENVIRONMENTAL", "SOCIAL", "OTHER"] as const;

export const CreateAwardCriterionBodySchema = z
  .object({
    name: z.string().trim().min(1).max(300),
    description: z.string().trim().min(1).optional(),
    weight: z.string().trim().min(1),
    parentCriterionId: z.string().uuid().optional(),
    displayOrder: z.number().int().min(0).optional(),
    lotId: z.string().uuid().optional(),
    type: z.enum(AWARD_CRITERION_TYPES).optional(),
    scoringMethod: z.string().trim().min(1).max(300).optional(),
    eliminationThreshold: z.string().trim().min(1).optional(),
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
    isEliminatory: z.boolean().optional(),
    lotId: z.string().uuid().optional(),
    requestedFormat: z.string().trim().min(1).max(80).optional(),
    signatureRequired: z.boolean().optional(),
    buyerProvidedTemplate: z.boolean().optional(),
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
    timezone: z.string().trim().min(1).max(80).optional(),
    lotId: z.string().uuid().optional(),
    mandatory: z.boolean().optional(),
  })
  .strict();
export type CreateMilestoneBody = z.infer<typeof CreateMilestoneBodySchema>;
export const UpdateMilestoneBodySchema = CreateMilestoneBodySchema.partial();
export type UpdateMilestoneBody = z.infer<typeof UpdateMilestoneBodySchema>;

export const RISK_CATEGORIES = [
  "ADMINISTRATIVE",
  "LEGAL",
  "TECHNICAL",
  "FINANCIAL",
  "PLANNING",
  "RESOURCE",
  "SECURITY",
  "OTHER",
] as const;
export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;

export const CreateRiskBodySchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().min(1).optional(),
    severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    source: z.string().trim().min(1).max(120).optional(),
    assignedTo: z.string().uuid().optional(),
    category: z.enum(RISK_CATEGORIES).optional(),
    probability: z.enum(RISK_LEVELS).optional(),
    impact: z.enum(RISK_LEVELS).optional(),
    lotId: z.string().uuid().optional(),
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

// ---- Buyer (V2 Sprint 3 §5) — jamais un ClientAccount, tous les champs optionnels sauf `name`
// (mission "les données peuvent être incomplètes ; ne pas inventer un SIRET"). ----

const BuyerFieldsBodySchema = z
  .object({
    name: z.string().trim().min(1).max(300),
    legalName: z.string().trim().min(1).max(300).optional(),
    identifier: z.string().trim().min(1).max(100).optional(),
    siret: z.string().trim().length(14).optional(),
    addressLine: z.string().trim().min(1).max(300).optional(),
    postalCode: z.string().trim().min(1).max(20).optional(),
    city: z.string().trim().min(1).max(120).optional(),
    country: z.string().trim().min(1).max(10).optional(),
    buyerType: z.string().trim().min(1).max(120).optional(),
    contactName: z.string().trim().min(1).max(200).optional(),
    contactEmail: z.string().trim().email().max(320).optional(),
    contactPhone: z.string().trim().min(1).max(40).optional(),
    profileUrl: z.string().trim().url().max(2048).optional(),
    notes: z.string().trim().min(1).optional(),
  })
  .strict();

export const CreateBuyerBodySchema = BuyerFieldsBodySchema;
export type CreateBuyerBody = z.infer<typeof CreateBuyerBodySchema>;

export const UpdateBuyerBodySchema = BuyerFieldsBodySchema.partial();
export type UpdateBuyerBody = z.infer<typeof UpdateBuyerBodySchema>;

export const ListBuyersQuerySchema = z
  .object({
    search: z.string().trim().min(1).max(200).optional(),
    includeArchived: z.coerce.boolean().optional(),
  })
  .strict();
export type ListBuyersQuery = z.infer<typeof ListBuyersQuerySchema>;
