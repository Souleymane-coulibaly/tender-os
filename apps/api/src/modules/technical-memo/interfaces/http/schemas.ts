import { z } from "zod";
import { TechnicalMemoCoverageStatus, TechnicalMemoTemplateOrigin } from "../../domain/enums";

export const IdParamSchema = z.string().uuid();

export const CreateTechnicalMemoBodySchema = z.object({
  templateOrigin: z.enum([TechnicalMemoTemplateOrigin.CompanyTemplate, TechnicalMemoTemplateOrigin.DceRequiredTemplate, TechnicalMemoTemplateOrigin.TenderOsSystem]),
  lotId: z.string().uuid().optional(),
});
export type CreateTechnicalMemoBody = z.infer<typeof CreateTechnicalMemoBodySchema>;

export const GenerateTechnicalMemoSectionBodySchema = z.object({
  userInstruction: z.string().min(1).max(2_000).optional(),
});
export type GenerateTechnicalMemoSectionBody = z.infer<typeof GenerateTechnicalMemoSectionBodySchema>;

export const ConfirmRequirementCoverageBodySchema = z.object({
  coverageStatus: z.enum([
    TechnicalMemoCoverageStatus.Covered,
    TechnicalMemoCoverageStatus.PartiallyCovered,
    TechnicalMemoCoverageStatus.NotCovered,
    TechnicalMemoCoverageStatus.NotApplicable,
    TechnicalMemoCoverageStatus.NeedsReview,
  ]),
  coverageReason: z.string().min(1).max(1_000).optional(),
});
export type ConfirmRequirementCoverageBody = z.infer<typeof ConfirmRequirementCoverageBodySchema>;

export const EditTechnicalMemoSectionBodySchema = z.object({
  content: z.string().min(1).max(50_000),
});
export type EditTechnicalMemoSectionBody = z.infer<typeof EditTechnicalMemoSectionBodySchema>;
