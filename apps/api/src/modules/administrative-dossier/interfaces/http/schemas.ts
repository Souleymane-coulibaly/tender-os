import { z } from "zod";
import { AdministrativeDocumentType } from "../../domain/administrative-document-type";

export const IdParamSchema = z.string().uuid();

const DOCUMENT_TYPE_VALUES = Object.values(AdministrativeDocumentType) as [AdministrativeDocumentType, ...AdministrativeDocumentType[]];

export const CreateAdministrativeRequirementBodySchema = z
  .object({
    title: z.string().min(1).max(300),
    description: z.string().max(2000).optional(),
    requirementType: z.string().min(1).max(40),
    expectedDocumentType: z.enum(DOCUMENT_TYPE_VALUES),
    required: z.boolean(),
    applicable: z.boolean().optional(),
    dueDate: z.coerce.date().optional(),
    validityRule: z.string().max(300).optional(),
    signatureRequired: z.boolean().optional(),
  })
  .strict();
export type CreateAdministrativeRequirementBody = z.infer<typeof CreateAdministrativeRequirementBodySchema>;

export const UpdateAdministrativeRequirementBodySchema = z
  .object({
    action: z.enum(["CONFIRM", "REJECT", "NOT_APPLICABLE"]).optional(),
    title: z.string().min(1).max(300).optional(),
    description: z.string().max(2000).optional(),
    dueDate: z.coerce.date().optional(),
    validityRule: z.string().max(300).optional(),
    required: z.boolean().optional(),
    signatureRequired: z.boolean().optional(),
    documentId: z.string().uuid().optional(),
    unmatchDocument: z.boolean().optional(),
  })
  .strict();
export type UpdateAdministrativeRequirementBody = z.infer<typeof UpdateAdministrativeRequirementBodySchema>;

export const CreateAdministrativeDocumentBodySchema = z
  .object({
    documentType: z.enum(DOCUMENT_TYPE_VALUES),
    label: z.string().min(1).max(300),
    requirementId: z.string().uuid().optional(),
  })
  .strict();
export type CreateAdministrativeDocumentBody = z.infer<typeof CreateAdministrativeDocumentBodySchema>;

export const AttachAdministrativeDocumentRevisionBodySchema = z
  .object({
    documentId: z.string().uuid(),
    expiresAt: z.coerce.date().optional(),
  })
  .strict();
export type AttachAdministrativeDocumentRevisionBody = z.infer<typeof AttachAdministrativeDocumentRevisionBodySchema>;

export const ValidateAdministrativeDocumentBodySchema = z
  .object({
    revisionId: z.string().uuid(),
  })
  .strict();
export type ValidateAdministrativeDocumentBody = z.infer<typeof ValidateAdministrativeDocumentBodySchema>;

export const RejectAdministrativeDocumentBodySchema = z
  .object({
    revisionId: z.string().uuid(),
  })
  .strict();
export type RejectAdministrativeDocumentBody = z.infer<typeof RejectAdministrativeDocumentBodySchema>;

// --- Sprint 8C Phase 2 ---

const SIGNATURE_MODE_VALUES = ["NOT_REQUIRED", "MANUAL", "ELECTRONIC", "EXTERNAL"] as const;

export const SetAdministrativeDocumentSignatureModeBodySchema = z
  .object({
    mode: z.enum(SIGNATURE_MODE_VALUES),
  })
  .strict();
export type SetAdministrativeDocumentSignatureModeBody = z.infer<typeof SetAdministrativeDocumentSignatureModeBodySchema>;

const CONSORTIUM_TYPE_VALUES = ["JOINT", "SOLIDARITY", "OTHER"] as const;

export const EnsureConsortiumBodySchema = z
  .object({
    type: z.enum(CONSORTIUM_TYPE_VALUES),
  })
  .strict();
export type EnsureConsortiumBody = z.infer<typeof EnsureConsortiumBodySchema>;

const ConsortiumMemberSchema = z
  .object({
    memberId: z.string().min(1).max(80),
    name: z.string().min(1).max(300),
    legalIdentifier: z.string().max(80).optional(),
    role: z.string().min(1).max(120),
    scopeDescription: z.string().max(500).optional(),
    percentage: z.number().min(0).max(100).optional(),
  })
  .strict();

export const UpdateConsortiumBodySchema = z
  .object({
    type: z.enum(CONSORTIUM_TYPE_VALUES).optional(),
    legalForm: z.string().max(200).optional(),
    liabilityMode: z.string().max(200).optional(),
    members: z.array(ConsortiumMemberSchema).optional(),
    mandataireMemberId: z.string().min(1).max(80).optional(),
  })
  .strict();
export type UpdateConsortiumBody = z.infer<typeof UpdateConsortiumBodySchema>;

const DC1_CANDIDATE_TYPE_VALUES = ["INDIVIDUAL", "CONSORTIUM"] as const;

export const UpdateDc1DeclarationBodySchema = z
  .object({
    candidateType: z.enum(DC1_CANDIDATE_TYPE_VALUES).optional(),
    consortiumId: z.string().uuid().optional(),
    declarations: z.string().max(4000).optional(),
    signatoryName: z.string().max(200).optional(),
    signatoryCapacity: z.string().max(200).optional(),
    signingPowerId: z.string().uuid().optional(),
    administrativeDocumentId: z.string().uuid().optional(),
    exclusionAttestation: z.boolean().optional(),
  })
  .strict();
export type UpdateDc1DeclarationBody = z.infer<typeof UpdateDc1DeclarationBodySchema>;

const RevenueByYearSchema = z
  .object({
    year: z.number().int(),
    amountValue: z.number(),
    amountCurrency: z.string().length(3),
  })
  .strict();

const StructuredCapacityStatementSchema = z
  .object({
    legalIdentity: z.string().max(500).optional(),
    revenueByYear: z.array(RevenueByYearSchema).optional(),
    financialCapacity: z.string().max(4000).optional(),
    technicalCapacity: z.string().max(4000).optional(),
    humanResources: z.string().max(4000).optional(),
    technicalResources: z.string().max(4000).optional(),
    insurances: z.string().max(4000).optional(),
    certifications: z.string().max(4000).optional(),
    additionalInfo: z.string().max(4000).optional(),
  })
  .strict();

export const CreateStructuredDeclarationVersionBodySchema = z
  .object({
    data: StructuredCapacityStatementSchema,
  })
  .strict();
export type CreateStructuredDeclarationVersionBody = z.infer<typeof CreateStructuredDeclarationVersionBodySchema>;

export const CreateSubcontractorDeclarationBodySchema = z
  .object({
    subcontractorName: z.string().min(1).max(300),
    subcontractorLegalIdentifier: z.string().max(80).optional(),
    servicesDescription: z.string().min(1),
    amountValue: z.number().min(0),
    amountCurrency: z.string().length(3),
    percentageOfTotal: z.number().min(0).max(100).optional(),
    paymentTerms: z.string().optional(),
    directPaymentApplicable: z.boolean().optional(),
    requiredDocuments: z.array(z.enum(DOCUMENT_TYPE_VALUES)).optional(),
    subcontractorProfileId: z.string().uuid().optional(),
    durationMonths: z.number().int().min(0).optional(),
  })
  .strict();
export type CreateSubcontractorDeclarationBody = z.infer<typeof CreateSubcontractorDeclarationBodySchema>;

export const UpdateSubcontractorDeclarationBodySchema = z
  .object({
    subcontractorName: z.string().min(1).max(300).optional(),
    servicesDescription: z.string().min(1).optional(),
    amountValue: z.number().min(0).optional(),
    amountCurrency: z.string().length(3).optional(),
    percentageOfTotal: z.number().min(0).max(100).optional(),
    paymentTerms: z.string().optional(),
    directPaymentApplicable: z.boolean().optional(),
    administrativeDocumentId: z.string().uuid().optional(),
  })
  .strict();
export type UpdateSubcontractorDeclarationBody = z.infer<typeof UpdateSubcontractorDeclarationBodySchema>;

export const UpdateEngagementActBodySchema = z
  .object({
    reference: z.string().max(200).optional(),
    lotReference: z.string().max(200).optional(),
    object: z.string().optional(),
    durationMonths: z.number().int().min(0).optional(),
    variants: z.string().optional(),
    subcontractingSummary: z.string().optional(),
    ribDocumentId: z.string().uuid().optional(),
    signatoryName: z.string().max(200).optional(),
    signatoryCapacity: z.string().max(200).optional(),
    administrativeDocumentId: z.string().uuid().optional(),
  })
  .strict();
export type UpdateEngagementActBody = z.infer<typeof UpdateEngagementActBodySchema>;

export const FreezeEngagementActPricingBodySchema = z
  .object({
    pricingEstimateId: z.string().uuid(),
    pricingEstimateVersionNumber: z.number().int().min(1),
  })
  .strict();
export type FreezeEngagementActPricingBody = z.infer<typeof FreezeEngagementActPricingBodySchema>;

export const CreateSigningPowerBodySchema = z
  .object({
    holderName: z.string().min(1).max(200),
    representedEntityDescription: z.string().min(1).max(300),
    validFrom: z.coerce.date().optional(),
    expiresAt: z.coerce.date().optional(),
    scope: z.string().min(1).max(300),
    limitations: z.string().optional(),
  })
  .strict();
export type CreateSigningPowerBody = z.infer<typeof CreateSigningPowerBodySchema>;

export const UpdateSigningPowerBodySchema = z
  .object({
    holderName: z.string().min(1).max(200).optional(),
    representedEntityDescription: z.string().min(1).max(300).optional(),
    validFrom: z.coerce.date().optional(),
    expiresAt: z.coerce.date().optional(),
    scope: z.string().min(1).max(300).optional(),
    limitations: z.string().optional(),
    administrativeDocumentId: z.string().uuid().optional(),
  })
  .strict();
export type UpdateSigningPowerBody = z.infer<typeof UpdateSigningPowerBodySchema>;

/** Sprint 8C.1 — brouillon DC4 : les clés DOIVENT rester synchronisées avec `DC4_FORM_FIELD_KEYS`
 *  (`form-mappers/dc4-form-mapper.ts`) — chaque valeur est une chaîne libre, la surcharge locale du
 *  champ correspondant, jamais une écriture sur `SubcontractorDeclaration`. */
export const SaveDc4OfficialFormDraftBodySchema = z
  .object({
    subcontractorName: z.string().max(2000).optional(),
    subcontractorLegalIdentifier: z.string().max(2000).optional(),
    servicesDescription: z.string().max(2000).optional(),
    amountValue: z.string().max(2000).optional(),
    amountCurrency: z.string().max(2000).optional(),
    percentageOfTotal: z.string().max(2000).optional(),
    paymentTerms: z.string().max(2000).optional(),
    directPaymentApplicable: z.string().max(2000).optional(),
  })
  .strict();
export type SaveDc4OfficialFormDraftBody = z.infer<typeof SaveDc4OfficialFormDraftBodySchema>;
