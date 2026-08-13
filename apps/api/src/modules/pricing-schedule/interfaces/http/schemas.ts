import { z } from "zod";
import { FinancialDocumentType } from "../../domain/enums";

export const IdParamSchema = z.string().uuid();

export const CreatePricingScheduleBodySchema = z
  .object({
    lotId: z.string().uuid().optional(),
    sourceDocumentId: z.string().uuid(),
    financialDocumentTypeOverride: z.enum([FinancialDocumentType.Bpu, FinancialDocumentType.Dpgf, FinancialDocumentType.Dqe, FinancialDocumentType.OtherFinancialSchedule]).optional(),
  })
  .strict();
export type CreatePricingScheduleBody = z.infer<typeof CreatePricingScheduleBodySchema>;

export const ExtractPricingScheduleVersionBodySchema = z
  .object({
    sourceDocumentVersionId: z.string().uuid(),
  })
  .strict();
export type ExtractPricingScheduleVersionBody = z.infer<typeof ExtractPricingScheduleVersionBodySchema>;

// Chaîne décimale (mission "jamais Number(...) pour un montant financier") — un format numérique
// simple est appliqué ici, jamais une valeur arbitraire ; l'injection de formule reste de toute
// façon impossible côté écriture XLSX (voir `xlsx-cell-writer.ts`, valeur toujours numérique réelle).
const DECIMAL_STRING = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d+)?$/, "Must be a plain decimal number, e.g. \"12.50\".");

export const SetPricingScheduleLineUnitPriceBodySchema = z
  .object({
    unitPrice: DECIMAL_STRING,
  })
  .strict();
export type SetPricingScheduleLineUnitPriceBody = z.infer<typeof SetPricingScheduleLineUnitPriceBodySchema>;

export const SetPricingScheduleLineCostBreakdownBodySchema = z
  .object({
    costBreakdown: z
      .object({
        laborCost: DECIMAL_STRING.optional(),
        materialCost: DECIMAL_STRING.optional(),
        equipmentCost: DECIMAL_STRING.optional(),
        subcontractingCost: DECIMAL_STRING.optional(),
        overheadCost: DECIMAL_STRING.optional(),
        marginValue: DECIMAL_STRING.optional(),
        marginRate: DECIMAL_STRING.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type SetPricingScheduleLineCostBreakdownBody = z.infer<typeof SetPricingScheduleLineCostBreakdownBodySchema>;

export const SetPricingScheduleLineCommentBodySchema = z
  .object({
    candidateComment: z.string().max(2_000).optional(),
  })
  .strict();
export type SetPricingScheduleLineCommentBody = z.infer<typeof SetPricingScheduleLineCommentBodySchema>;

export const ValidatePricingScheduleVersionBodySchema = z
  .object({
    overrideJustification: z.string().min(1).max(1_000).optional(),
  })
  .strict();
export type ValidatePricingScheduleVersionBody = z.infer<typeof ValidatePricingScheduleVersionBodySchema>;
