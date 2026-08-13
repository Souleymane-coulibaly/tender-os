import { z } from "zod";
import { EntitlementFeature } from "../../domain/entitlement-feature";
import { QuotaType, UNLIMITED } from "../../domain/quota-type";

export const OrganizationIdParamSchema = z.string().uuid();
export const OverrideIdParamSchema = z.string().uuid();

const QuotaLimitSchema = z.union([z.number().int().min(0), z.literal(UNLIMITED)]);

/** Mission §31/§39 — exactement une cible (feature XOR quota), reason obligatoire, `.strict()`
 *  (mission §46 anti mass-assignment : `plan`/`entitlement`/`override`/`isPlatformAdmin` envoyés
 *  dans le body ne sont jamais lus, `.strict()` les rejette explicitement en 400). */
export const CreateEntitlementOverrideBodySchema = z
  .object({
    feature: z.enum(Object.values(EntitlementFeature) as [string, ...string[]]).optional(),
    featureEnabled: z.boolean().optional(),
    quota: z.enum(Object.values(QuotaType) as [string, ...string[]]).optional(),
    quotaLimit: QuotaLimitSchema.optional(),
    reason: z.string().trim().min(1).max(500),
    expiresAt: z.coerce.date().optional(),
  })
  .strict()
  .refine((data) => (data.feature !== undefined) !== (data.quota !== undefined), { message: "Exactly one of feature or quota must be provided." })
  .refine((data) => data.feature === undefined || data.featureEnabled !== undefined, { message: "featureEnabled is required when feature is provided." })
  .refine((data) => data.quota === undefined || data.quotaLimit !== undefined, { message: "quotaLimit is required when quota is provided." });

export type CreateEntitlementOverrideBody = z.infer<typeof CreateEntitlementOverrideBodySchema>;

export const ListEntitlementOverridesQuerySchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).optional().default(25),
  })
  .strict();

export type ListEntitlementOverridesQuery = z.infer<typeof ListEntitlementOverridesQuerySchema>;
