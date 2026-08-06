import { z } from "zod";
import {
  CompanyDocumentCategory,
  CompanyInsuranceType,
  CompanyReferenceConfidentiality,
  CompanyRepresentativeType,
  MaterialResourceAvailability,
  MaterialResourceOwnership,
  SatelliteStatus,
} from "../../domain/enums";

export const IdParamSchema = z.string().uuid();

const STATUS_VALUES = Object.values(SatelliteStatus) as [string, ...string[]];
const REPRESENTATIVE_TYPE_VALUES = Object.values(CompanyRepresentativeType) as [string, ...string[]];
const INSURANCE_TYPE_VALUES = Object.values(CompanyInsuranceType) as [string, ...string[]];
const REFERENCE_CONFIDENTIALITY_VALUES = Object.values(CompanyReferenceConfidentiality) as [string, ...string[]];
const MATERIAL_AVAILABILITY_VALUES = Object.values(MaterialResourceAvailability) as [string, ...string[]];
const MATERIAL_OWNERSHIP_VALUES = Object.values(MaterialResourceOwnership) as [string, ...string[]];
const DOCUMENT_CATEGORY_VALUES = Object.values(CompanyDocumentCategory) as [string, ...string[]];

/** Mission §4.1 : jamais bloquant sur l'incomplétude — tous les champs optionnels sauf
 *  `confirmDuplicate` (booléen de confirmation explicite du doublon SIRET). */
export const UpsertCompanyLegalIdentityBodySchema = z
  .object({
    legalName: z.string().max(240).optional(),
    tradeName: z.string().max(240).optional(),
    siren: z.string().max(9).optional(),
    siretPrincipal: z.string().max(14).optional(),
    vatNumber: z.string().max(20).optional(),
    legalForm: z.string().max(120).optional(),
    shareCapitalAmount: z.string().max(20).optional(),
    shareCapitalCurrency: z.string().max(3).optional(),
    apeCode: z.string().max(10).optional(),
    incorporatedAt: z.coerce.date().optional(),
    rcsNumber: z.string().max(40).optional(),
    rcsCity: z.string().max(120).optional(),
    registrationCountry: z.string().max(10).optional(),
    addressLine: z.string().max(300).optional(),
    addressComplement: z.string().max(300).optional(),
    postalCode: z.string().max(20).optional(),
    city: z.string().max(120).optional(),
    region: z.string().max(120).optional(),
    country: z.string().max(10).optional(),
    phone: z.string().max(40).optional(),
    generalEmail: z.string().email().max(320).optional(),
    website: z.string().max(2048).optional(),
    confirmDuplicate: z.boolean().optional(),
  })
  .strict();
export type UpsertCompanyLegalIdentityBody = z.infer<typeof UpsertCompanyLegalIdentityBodySchema>;

export const CreateCompanyRepresentativeBodySchema = z
  .object({
    firstName: z.string().min(1).max(120),
    lastName: z.string().min(1).max(120),
    type: z.enum(REPRESENTATIVE_TYPE_VALUES),
    jobTitle: z.string().max(200).optional(),
    email: z.string().email().max(320).optional(),
    phone: z.string().max(40).optional(),
    signatureScope: z.string().max(2000).optional(),
    signatureLimitations: z.string().max(2000).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  })
  .strict();
export type CreateCompanyRepresentativeBody = z.infer<typeof CreateCompanyRepresentativeBodySchema>;

export const UpdateCompanyRepresentativeBodySchema = CreateCompanyRepresentativeBodySchema.partial().extend({ status: z.enum(STATUS_VALUES).optional() }).strict();
export type UpdateCompanyRepresentativeBody = z.infer<typeof UpdateCompanyRepresentativeBodySchema>;

export const CreateCompanyBankAccountBodySchema = z
  .object({
    accountHolder: z.string().min(1).max(240),
    bankName: z.string().max(200).optional(),
    iban: z.string().min(1).max(34),
    bic: z.string().max(11).optional(),
    country: z.string().max(10).optional(),
    currency: z.string().max(3).optional(),
    documentId: z.string().uuid().optional(),
    isPrimary: z.boolean().optional(),
  })
  .strict();
export type CreateCompanyBankAccountBody = z.infer<typeof CreateCompanyBankAccountBodySchema>;

export const UpdateCompanyBankAccountBodySchema = CreateCompanyBankAccountBodySchema.partial().extend({ status: z.enum(STATUS_VALUES).optional() }).strict();
export type UpdateCompanyBankAccountBody = z.infer<typeof UpdateCompanyBankAccountBodySchema>;

export const CreateCompanyInsuranceBodySchema = z
  .object({
    type: z.enum(INSURANCE_TYPE_VALUES),
    otherTypeLabel: z.string().max(200).optional(),
    insurer: z.string().max(200).optional(),
    policyNumber: z.string().max(100).optional(),
    startDate: z.coerce.date().optional(),
    expiresAt: z.coerce.date().optional(),
    coverageScope: z.string().max(2000).optional(),
    coverageAmount: z.string().max(20).optional(),
    coverageCurrency: z.string().max(3).optional(),
    documentId: z.string().uuid().optional(),
  })
  .strict();
export type CreateCompanyInsuranceBody = z.infer<typeof CreateCompanyInsuranceBodySchema>;

export const UpdateCompanyInsuranceBodySchema = CreateCompanyInsuranceBodySchema.partial().extend({ status: z.enum(STATUS_VALUES).optional() }).strict();
export type UpdateCompanyInsuranceBody = z.infer<typeof UpdateCompanyInsuranceBodySchema>;

export const CreateCompanyCertificationBodySchema = z
  .object({
    name: z.string().min(1).max(200),
    issuer: z.string().max(200).optional(),
    number: z.string().max(100).optional(),
    type: z.string().max(100).optional(),
    scope: z.string().max(300).optional(),
    obtainedAt: z.coerce.date().optional(),
    expiresAt: z.coerce.date().optional(),
    documentId: z.string().uuid().optional(),
  })
  .strict();
export type CreateCompanyCertificationBody = z.infer<typeof CreateCompanyCertificationBodySchema>;

export const UpdateCompanyCertificationBodySchema = CreateCompanyCertificationBodySchema.partial().extend({ status: z.enum(STATUS_VALUES).optional() }).strict();
export type UpdateCompanyCertificationBody = z.infer<typeof UpdateCompanyCertificationBodySchema>;

export const CreateCompanyReferenceBodySchema = z
  .object({
    projectName: z.string().min(1).max(300),
    referenceClientName: z.string().max(240).optional(),
    sector: z.string().max(120).optional(),
    description: z.string().max(5000).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    amountValue: z.string().max(20).optional(),
    amountCurrency: z.string().max(3).optional(),
    companyRole: z.string().max(200).optional(),
    lotsOrServices: z.string().max(2000).optional(),
    skillsOrTechnologies: z.string().max(2000).optional(),
    results: z.string().max(2000).optional(),
    contactName: z.string().max(200).optional(),
    contactEmail: z.string().email().max(320).optional(),
    contactPhone: z.string().max(40).optional(),
    confidentiality: z.enum(REFERENCE_CONFIDENTIALITY_VALUES).optional(),
  })
  .strict();
export type CreateCompanyReferenceBody = z.infer<typeof CreateCompanyReferenceBodySchema>;

export const UpdateCompanyReferenceBodySchema = CreateCompanyReferenceBodySchema.partial()
  .extend({ status: z.enum(["DRAFT", "VALIDATED", "ARCHIVED"]).optional() })
  .strict();
export type UpdateCompanyReferenceBody = z.infer<typeof UpdateCompanyReferenceBodySchema>;

export const AttachCompanyReferenceDocumentBodySchema = z.object({ documentId: z.string().uuid() }).strict();
export type AttachCompanyReferenceDocumentBody = z.infer<typeof AttachCompanyReferenceDocumentBodySchema>;

export const CreateCompanyHumanResourceBodySchema = z
  .object({
    category: z.string().min(1).max(120),
    title: z.string().min(1).max(200),
    headcount: z.number().int().positive().optional(),
    qualification: z.string().max(200).optional(),
    averageExperienceYears: z.number().int().nonnegative().optional(),
    skills: z.string().max(2000).optional(),
    certifications: z.string().max(2000).optional(),
    availabilityNote: z.string().max(300).optional(),
    location: z.string().max(200).optional(),
  })
  .strict();
export type CreateCompanyHumanResourceBody = z.infer<typeof CreateCompanyHumanResourceBodySchema>;

export const UpdateCompanyHumanResourceBodySchema = CreateCompanyHumanResourceBodySchema.partial().extend({ status: z.enum(STATUS_VALUES).optional() }).strict();
export type UpdateCompanyHumanResourceBody = z.infer<typeof UpdateCompanyHumanResourceBodySchema>;

export const CreateCompanyMaterialResourceBodySchema = z
  .object({
    category: z.string().min(1).max(120),
    name: z.string().min(1).max(240),
    description: z.string().max(2000).optional(),
    quantity: z.number().int().positive().optional(),
    characteristics: z.string().max(2000).optional(),
    location: z.string().max(200).optional(),
    availabilityStatus: z.enum(MATERIAL_AVAILABILITY_VALUES).optional(),
    ownershipType: z.enum(MATERIAL_OWNERSHIP_VALUES).optional(),
    documentId: z.string().uuid().optional(),
  })
  .strict();
export type CreateCompanyMaterialResourceBody = z.infer<typeof CreateCompanyMaterialResourceBodySchema>;

export const UpdateCompanyMaterialResourceBodySchema = CreateCompanyMaterialResourceBodySchema.partial().extend({ status: z.enum(STATUS_VALUES).optional() }).strict();
export type UpdateCompanyMaterialResourceBody = z.infer<typeof UpdateCompanyMaterialResourceBodySchema>;

export const AttachClientAccountDocumentBodySchema = z
  .object({
    documentId: z.string().uuid(),
    category: z.enum(DOCUMENT_CATEGORY_VALUES),
    issuedAt: z.coerce.date().optional(),
    expiresAt: z.coerce.date().optional(),
  })
  .strict();
export type AttachClientAccountDocumentBody = z.infer<typeof AttachClientAccountDocumentBodySchema>;
