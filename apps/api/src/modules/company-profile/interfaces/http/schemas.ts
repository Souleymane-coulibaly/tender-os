import { z } from "zod";
import { CLIENT_COMMERCIAL_DOCUMENT_CATEGORIES, LEGACY_BIDDER_DOCUMENT_CATEGORIES } from "../../domain/client-commercial-document-category";
import { CANDIDATE_DOCUMENT_CATEGORIES } from "../../domain/candidate-document-category";
import {
  CompanyInsuranceType,
  CompanyRepresentativeType,
  CompanyReferenceConfidentiality,
  MaterialResourceAvailability,
  MaterialResourceOwnership,
  SatelliteStatus,
} from "../../domain/enums";

export const IdParamSchema = z.string().uuid();

const REPRESENTATIVE_TYPE_VALUES = Object.values(CompanyRepresentativeType) as [string, ...string[]];
const STATUS_VALUES = Object.values(SatelliteStatus) as [string, ...string[]];
const INSURANCE_TYPE_VALUES = Object.values(CompanyInsuranceType) as [string, ...string[]];
const REFERENCE_CONFIDENTIALITY_VALUES = Object.values(CompanyReferenceConfidentiality) as [string, ...string[]];
const MATERIAL_AVAILABILITY_VALUES = Object.values(MaterialResourceAvailability) as [string, ...string[]];
const MATERIAL_OWNERSHIP_VALUES = Object.values(MaterialResourceOwnership) as [string, ...string[]];


/**
 * Checkpoint TENDEROS-2.1-CCV2-I.1 — DEUX schemas distincts, parce que les deux surfaces n'ont pas
 * la meme semantique. Les confondre etait precisement le defaut : le controleur CANDIDATE reutilise
 * ce schema, et le restreindre aux contacts CRM aurait interdit les representants LEGAUX du
 * candidat — soit l'inverse exact de la frontiere voulue.
 *
 * `CreateCompanyRepresentativeBodySchema` : surface CANDIDATE. Tous les types, y compris
 * `LEGAL_REPRESENTATIVE`/`SIGNATORY`, et les champs de portee de signature — c'est l'entreprise
 * candidate qui signe un acte d'engagement.
 */
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

/**
 * Surface CLIENT : un CONTACT COMMERCIAL (mission §5). Les types d'autorite juridique et les champs
 * de portee de signature sont ABSENTS du schema — `.strict()` les rejette donc explicitement, plutot
 * que de les accepter en silence puis de les perdre.
 */
export const CLIENT_COMMERCIAL_CONTACT_TYPE_VALUES = ["ADMINISTRATIVE_CONTACT", "COMMERCIAL_CONTACT", "TECHNICAL_CONTACT"] as const;

export const CreateClientCommercialContactBodySchema = z
  .object({
    firstName: z.string().min(1).max(120),
    lastName: z.string().min(1).max(120),
    type: z.enum(CLIENT_COMMERCIAL_CONTACT_TYPE_VALUES),
    jobTitle: z.string().max(200).optional(),
    email: z.string().email().max(320).optional(),
    phone: z.string().max(40).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  })
  .strict();
export type CreateClientCommercialContactBody = z.infer<typeof CreateClientCommercialContactBodySchema>;

export const UpdateClientCommercialContactBodySchema = CreateClientCommercialContactBodySchema.partial().extend({ status: z.enum(STATUS_VALUES).optional() }).strict();
export type UpdateClientCommercialContactBody = z.infer<typeof UpdateClientCommercialContactBodySchema>;

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

/**
 * Checkpoint TENDEROS-2.1-CCV2-I.1 — deux barrieres, chacune a son role.
 *
 * Le SCHEMA borne le vocabulaire aux categories CONNUES (commerciales + historiques), exactement
 * comme la contrainte CHECK en base : une valeur inventee est rejetee ici.
 *
 * La regle SEMANTIQUE — « une piece de candidature ne se rattache pas au client commercial » — est
 * portee par le domaine (`assertClientCommercialDocumentCategory`), qui peut alors repondre un 422
 * ACTIONNABLE nommant la bonne fiche, la ou le schema ne dirait qu'« invalide ». Restreindre le
 * schema aux seules categories commerciales aurait masque ce message derriere un 400 generique.
 */
export const AttachClientAccountDocumentBodySchema = z
  .object({
    documentId: z.string().uuid(),
    category: z.enum([...CLIENT_COMMERCIAL_DOCUMENT_CATEGORIES, ...LEGACY_BIDDER_DOCUMENT_CATEGORIES] as [string, ...string[]]),
    issuedAt: z.coerce.date().optional(),
    expiresAt: z.coerce.date().optional(),
  })
  .strict();
export type AttachClientAccountDocumentBody = z.infer<typeof AttachClientAccountDocumentBodySchema>;

/** Checkpoint TENDEROS-2.1-CCV2-D — documents de l'entreprise candidate. `.strict()` : un corps
 *  contenant `organizationId`, `candidateCompanyId`, `storageKey` ou `currentVersionId` est REJETÉ,
 *  jamais silencieusement absorbé — ces identifiants viennent exclusivement du contexte serveur. */
export const AttachCandidateDocumentBodySchema = z
  .object({
    documentId: z.string().uuid(),
    category: z.enum(CANDIDATE_DOCUMENT_CATEGORIES as [string, ...string[]]),
    label: z.string().max(240).optional(),
    issuedAt: z.coerce.date().optional(),
    validFrom: z.coerce.date().optional(),
    validUntil: z.coerce.date().optional(),
  })
  .strict()
  .refine((body) => body.validFrom === undefined || body.validUntil === undefined || body.validUntil >= body.validFrom, {
    message: "validUntil must not precede validFrom",
    path: ["validUntil"],
  });
export type AttachCandidateDocumentBody = z.infer<typeof AttachCandidateDocumentBodySchema>;

export const UpdateCandidateDocumentBodySchema = z
  .object({
    category: z.enum(CANDIDATE_DOCUMENT_CATEGORIES as [string, ...string[]]).optional(),
    label: z.string().max(240).optional(),
    issuedAt: z.coerce.date().optional(),
    validFrom: z.coerce.date().optional(),
    validUntil: z.coerce.date().optional(),
  })
  .strict();
export type UpdateCandidateDocumentBody = z.infer<typeof UpdateCandidateDocumentBodySchema>;
