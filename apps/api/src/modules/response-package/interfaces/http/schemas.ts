import { z } from "zod";
import { PackageItemApplicabilityStatus, PackageItemRequirementType } from "../../domain/enums";

export const IdParamSchema = z.string().uuid();

export const CreateResponsePackageBodySchema = z.object({
  lotId: z.string().uuid().optional(),
});
export type CreateResponsePackageBody = z.infer<typeof CreateResponsePackageBodySchema>;

export const CorrectPackageItemQualificationBodySchema = z.object({
  requirementType: z.enum([PackageItemRequirementType.Required, PackageItemRequirementType.Optional, PackageItemRequirementType.Conditional]),
  applicabilityStatus: z.enum([PackageItemApplicabilityStatus.Applicable, PackageItemApplicabilityStatus.NotApplicable, PackageItemApplicabilityStatus.NeedsReview]),
  conditionText: z.string().max(1_000).optional(),
});
export type CorrectPackageItemQualificationBody = z.infer<typeof CorrectPackageItemQualificationBodySchema>;

export const SelectPackageItemDocumentBodySchema = z.object({
  documentId: z.string().uuid(),
  documentVersionId: z.string().uuid(),
});
export type SelectPackageItemDocumentBody = z.infer<typeof SelectPackageItemDocumentBodySchema>;
