import { z } from "zod";
import { SubcontractorProfileStatus } from "../../domain/subcontractor-profile-status";

export const IdParamSchema = z.string().uuid();

const STATUS_VALUES = Object.values(SubcontractorProfileStatus) as [string, ...string[]];

export const CreateSubcontractorProfileBodySchema = z
  .object({
    legalName: z.string().min(1).max(240),
    tradeName: z.string().max(240).optional(),
    siren: z.string().max(9).optional(),
    siret: z.string().max(14).optional(),
    vatNumber: z.string().max(20).optional(),
    legalForm: z.string().max(120).optional(),
    apeCode: z.string().max(10).optional(),
    addressLine: z.string().max(300).optional(),
    postalCode: z.string().max(20).optional(),
    city: z.string().max(120).optional(),
    country: z.string().max(10).optional(),
    legalRepresentativeName: z.string().max(200).optional(),
    contactEmail: z.string().email().max(320).optional(),
    contactPhone: z.string().max(40).optional(),
    skills: z.string().max(2000).optional(),
    domains: z.string().max(2000).optional(),
    humanResourcesSummary: z.string().max(4000).optional(),
    materialResourcesSummary: z.string().max(4000).optional(),
    bankAccountHolder: z.string().max(240).optional(),
    iban: z.string().max(34).optional(),
    bic: z.string().max(11).optional(),
    bankDocumentId: z.string().uuid().optional(),
    confirmDuplicate: z.boolean().optional(),
  })
  .strict();
export type CreateSubcontractorProfileBody = z.infer<typeof CreateSubcontractorProfileBodySchema>;

export const UpdateSubcontractorProfileBodySchema = CreateSubcontractorProfileBodySchema.omit({ confirmDuplicate: true })
  .partial()
  .extend({ status: z.enum(STATUS_VALUES).optional() })
  .strict();
export type UpdateSubcontractorProfileBody = z.infer<typeof UpdateSubcontractorProfileBodySchema>;

export const ListSubcontractorProfilesQuerySchema = z
  .object({
    status: z.enum(STATUS_VALUES).optional(),
    search: z.string().max(200).optional(),
  })
  .strict();
export type ListSubcontractorProfilesQuery = z.infer<typeof ListSubcontractorProfilesQuerySchema>;

export const CreateSubcontractorReferenceBodySchema = z
  .object({
    projectName: z.string().min(1).max(300),
    clientName: z.string().max(240).optional(),
    description: z.string().max(5000).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  })
  .strict();
export type CreateSubcontractorReferenceBody = z.infer<typeof CreateSubcontractorReferenceBodySchema>;

export const CreateSubcontractorCertificationBodySchema = z
  .object({
    name: z.string().min(1).max(200),
    issuer: z.string().max(200).optional(),
    number: z.string().max(100).optional(),
    obtainedAt: z.coerce.date().optional(),
    expiresAt: z.coerce.date().optional(),
    documentId: z.string().uuid().optional(),
  })
  .strict();
export type CreateSubcontractorCertificationBody = z.infer<typeof CreateSubcontractorCertificationBodySchema>;

export const CreateSubcontractorInsuranceBodySchema = z
  .object({
    type: z.string().min(1).max(40),
    insurer: z.string().max(200).optional(),
    policyNumber: z.string().max(100).optional(),
    expiresAt: z.coerce.date().optional(),
    documentId: z.string().uuid().optional(),
  })
  .strict();
export type CreateSubcontractorInsuranceBody = z.infer<typeof CreateSubcontractorInsuranceBodySchema>;

export const AttachSubcontractorProfileDocumentBodySchema = z
  .object({
    documentId: z.string().uuid(),
    category: z.enum(["KBIS", "TAX_CERTIFICATE", "SOCIAL_CERTIFICATE", "INSURANCE", "CERTIFICATION", "BANK_DETAILS", "REFERENCE", "OTHER"]),
  })
  .strict();
export type AttachSubcontractorProfileDocumentBody = z.infer<typeof AttachSubcontractorProfileDocumentBodySchema>;
