import { z } from "zod";
import { EMAIL_FREQUENCIES } from "../../domain/enums";

export const IdParamSchema = z.string().uuid();

const CriteriaSchema = z
  .object({
    includeKeywords: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
    excludeKeywords: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
    cpvCodes: z.array(z.string().trim().min(2).max(20)).max(20).optional(),
    countries: z.array(z.string().trim().min(2).max(10)).max(50).optional(),
    regions: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    departments: z.array(z.string().trim().min(1).max(10)).max(120).optional(),
    cities: z.array(z.string().trim().min(1).max(160)).max(50).optional(),
    marketTypes: z.array(z.enum(["PUBLIC", "PRIVATE"])).max(2).optional(),
    sources: z.array(z.string().trim().min(1).max(20)).max(10).optional(),
    minAmount: z.number().nonnegative().optional(),
    maxAmount: z.number().nonnegative().optional(),
    includeUnknownAmount: z.boolean().optional(),
    publishedAfter: z.string().datetime().optional(),
    deadlineAfterDays: z.number().int().min(0).max(3650).optional(),
    deadlineBeforeDate: z.string().datetime().optional(),
    procedureTypes: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  })
  .strict();

export type CriteriaBody = z.infer<typeof CriteriaSchema>;

/** Conversion string ISO -> Date faite ICI (au contrôleur), jamais via un `.transform()` Zod : le
 *  pipe générique `ZodValidationPipe<T>` (partagé par tous les modules) type son schéma en
 *  `ZodSchema<T>` avec Input=Output — incompatible avec un `ZodEffects` dont l'Input diffère de
 *  l'Output après `.transform()`. */
export function toCriteriaCommand(criteria: CriteriaBody | undefined) {
  if (!criteria) return undefined;
  return {
    ...criteria,
    publishedAfter: criteria.publishedAfter ? new Date(criteria.publishedAfter) : undefined,
    deadlineBeforeDate: criteria.deadlineBeforeDate ? new Date(criteria.deadlineBeforeDate) : undefined,
  };
}

export const CreateSavedSearchBodySchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    clientAccountId: z.string().uuid().optional(),
    criteria: CriteriaSchema.optional(),
    alertInApp: z.boolean().optional(),
    alertEmail: z.boolean().optional(),
    emailFrequency: z.enum(EMAIL_FREQUENCIES as unknown as [string, ...string[]]).optional(),
  })
  .strict();
export type CreateSavedSearchBody = z.infer<typeof CreateSavedSearchBodySchema>;

export const UpdateSavedSearchBodySchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    clientAccountId: z.string().uuid().nullable().optional(),
    criteria: CriteriaSchema.optional(),
    alertInApp: z.boolean().optional(),
    alertEmail: z.boolean().optional(),
    emailFrequency: z.enum(EMAIL_FREQUENCIES as unknown as [string, ...string[]]).optional(),
  })
  .strict();
export type UpdateSavedSearchBody = z.infer<typeof UpdateSavedSearchBodySchema>;

export const SetSavedSearchStatusBodySchema = z.object({ enabled: z.boolean() }).strict();
export type SetSavedSearchStatusBody = z.infer<typeof SetSavedSearchStatusBodySchema>;

export const SetMatchStatusBodySchema = z.object({ status: z.enum(["NEW", "INTERESTED", "IGNORED"]) }).strict();
export type SetMatchStatusBody = z.infer<typeof SetMatchStatusBodySchema>;

export const PromoteExternalTenderBodySchema = z
  .object({ clientAccountId: z.string().uuid().optional(), confirmDuplicate: z.boolean().optional() })
  .strict();
export type PromoteExternalTenderBody = z.infer<typeof PromoteExternalTenderBodySchema>;

export const ListMatchesQuerySchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  })
  .strict();
export type ListMatchesQuery = z.infer<typeof ListMatchesQuerySchema>;
