import { z } from "zod";

export const IdParamSchema = z.string().uuid();

export const OPPORTUNITY_SOURCES = ["MANUAL", "BOAMP", "TED", "PRIVATE"] as const;
export const OPPORTUNITY_STATUSES = ["DRAFT", "TO_QUALIFY", "QUALIFIED", "GO", "GO_CONDITIONAL", "NO_GO", "PROMOTED", "DISMISSED", "ARCHIVED"] as const;
export const OPPORTUNITY_MANUAL_STATUSES = ["DRAFT", "TO_QUALIFY", "QUALIFIED", "DISMISSED"] as const;
export const GO_NO_GO_DECISION_VALUES = ["GO", "GO_CONDITIONAL", "NO_GO"] as const;

const OpportunityDetailsBodySchema = z.object({
  clientAccountId: z.string().uuid().optional(),
  buyerId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().min(1).optional(),
  source: z.enum(OPPORTUNITY_SOURCES).optional(),
  externalReference: z.string().trim().min(1).max(255).optional(),
  buyerName: z.string().trim().min(1).max(300).optional(),
  sector: z.string().trim().min(1).max(300).optional(),
  cpvCode: z.string().trim().min(1).max(20).optional(),
  location: z.string().trim().min(1).max(300).optional(),
  geographicZone: z.string().trim().min(1).max(300).optional(),
  publicationDate: z.string().datetime().optional(),
  submissionDeadline: z.string().datetime().optional(),
  estimatedAmount: z.string().trim().min(1).max(30).optional(),
  currency: z.string().trim().length(3).optional(),
  procedureType: z.string().trim().min(1).max(80).optional(),
});

export const CreateOpportunityBodySchema = OpportunityDetailsBodySchema.strict();
export type CreateOpportunityBody = z.infer<typeof CreateOpportunityBodySchema>;

export const UpdateOpportunityBodySchema = OpportunityDetailsBodySchema.partial({ title: true }).strict();
export type UpdateOpportunityBody = z.infer<typeof UpdateOpportunityBodySchema>;

export const ListOpportunitiesQuerySchema = z
  .object({
    status: z.enum(OPPORTUNITY_STATUSES).optional(),
    clientAccountId: z.string().uuid().optional(),
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.enum(["createdAt", "submissionDeadline", "title", "updatedAt"]).optional(),
    sortDirection: z.enum(["asc", "desc"]).optional(),
  })
  .strict();
export type ListOpportunitiesQuery = z.infer<typeof ListOpportunitiesQuerySchema>;

export const ChangeOpportunityStatusBodySchema = z
  .object({
    status: z.enum(OPPORTUNITY_MANUAL_STATUSES),
  })
  .strict();
export type ChangeOpportunityStatusBody = z.infer<typeof ChangeOpportunityStatusBodySchema>;

const GoNoGoDecisionBodySchema = z.object({
  decision: z.enum(GO_NO_GO_DECISION_VALUES),
  justification: z.string().trim().min(1).optional(),
  conditions: z.string().trim().min(1).optional(),
  comment: z.string().trim().min(1).optional(),
});

export const RecordOpportunityGoNoGoDecisionBodySchema = GoNoGoDecisionBodySchema.extend({
  linkedQuickScoreId: z.string().uuid().optional(),
}).strict();
export type RecordOpportunityGoNoGoDecisionBody = z.infer<typeof RecordOpportunityGoNoGoDecisionBodySchema>;

export const RecordTenderGoNoGoDecisionBodySchema = GoNoGoDecisionBodySchema.extend({
  linkedReportId: z.string().uuid().optional(),
}).strict();
export type RecordTenderGoNoGoDecisionBody = z.infer<typeof RecordTenderGoNoGoDecisionBodySchema>;

// Audit Codex round 2 — `justification` n'est obligatoire QUE si l'acteur agit via le
// contournement administratif (`resolveGoNoGoClientAccess`), jamais pour le chemin normal
// CLIENT_MANAGER : la règle "obligatoire" est appliquée au niveau domaine
// (`GoNoGoAdminBypassJustificationRequiredError`), pas ici — le schéma reste volontairement
// permissif (optionnel).
export const PromoteOpportunityBodySchema = z
  .object({
    justification: z.string().trim().min(1).optional(),
  })
  .strict();
export type PromoteOpportunityBody = z.infer<typeof PromoteOpportunityBodySchema>;
