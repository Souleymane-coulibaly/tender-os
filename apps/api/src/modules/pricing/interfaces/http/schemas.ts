import { z } from "zod";

export const IdParamSchema = z.string().uuid();

/** Mission Sprint 7 §"Hypothèses de prévision" — bornes reflétant celles du domaine
 *  (`PricingAssumptions`), revalidées ici à la frontière HTTP (jamais une confiance dans le
 *  frontend, mais une erreur 400 précoce plutôt qu'un 422 tardif pour un format grossièrement
 *  invalide). */
export const PricingAssumptionsBodySchema = z
  .object({
    taskTypes: z.array(z.string().min(1).max(60)).max(20).optional(),
    estimatedGenerationsCount: z.number().int().min(0).max(10_000).optional(),
    estimatedInputTokensPerGeneration: z.number().int().min(0).max(2_000_000).optional(),
    estimatedOutputTokensPerGeneration: z.number().int().min(0).max(2_000_000).optional(),
    workHours: z.number().min(0).max(100_000).optional(),
    hourlyRate: z.string().regex(/^\d+(\.\d+)?$/).optional(),
    headcount: z.number().int().min(0).max(1_000).optional(),
    additionalFeesAmount: z.string().regex(/^\d+(\.\d+)?$/).optional(),
    notes: z.string().max(2_000).optional(),
  })
  .strict();
export type PricingAssumptionsBody = z.infer<typeof PricingAssumptionsBodySchema>;

export const PreviewGenerationCostBodySchema = z
  .object({
    taskType: z.string().min(1).max(60),
    estimatedGenerationsCount: z.number().int().min(1).max(10_000).optional(),
    estimatedInputTokensPerGeneration: z.number().int().min(0).max(2_000_000).optional(),
    estimatedOutputTokensPerGeneration: z.number().int().min(0).max(2_000_000).optional(),
  })
  .strict();
export type PreviewGenerationCostBody = z.infer<typeof PreviewGenerationCostBodySchema>;

export const CreatePricingEstimateBodySchema = z
  .object({
    taskType: z.string().min(1).max(60).optional(),
    assumptions: PricingAssumptionsBodySchema,
  })
  .strict();
export type CreatePricingEstimateBody = z.infer<typeof CreatePricingEstimateBodySchema>;

export const RecalculatePricingEstimateBodySchema = z
  .object({
    taskType: z.string().min(1).max(60).optional(),
    assumptions: PricingAssumptionsBodySchema,
    reason: z.string().min(1).max(500),
  })
  .strict();
export type RecalculatePricingEstimateBody = z.infer<typeof RecalculatePricingEstimateBodySchema>;

export const ListPricingEstimatesQuerySchema = z
  .object({
    clientAccountId: z.string().uuid().optional(),
    includeArchived: z.coerce.boolean().optional(),
    limit: z.coerce.number().int().positive().max(100).default(20),
    offset: z.coerce.number().int().nonnegative().default(0),
  })
  .strict();
export type ListPricingEstimatesQuery = z.infer<typeof ListPricingEstimatesQuerySchema>;

export const GetPricingEstimateQuerySchema = z
  .object({
    version: z.coerce.number().int().positive().optional(),
  })
  .strict();
export type GetPricingEstimateQuery = z.infer<typeof GetPricingEstimateQuerySchema>;

export const DateRangeQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .strict();
export type DateRangeQuery = z.infer<typeof DateRangeQuerySchema>;
