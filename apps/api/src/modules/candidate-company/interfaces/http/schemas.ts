import { z } from "zod";

export const IdParamSchema = z.string().uuid();

export const CreateCandidateCompanyBodySchema = z
  .object({
    name: z.string().min(1).max(200),
    legalName: z.string().max(240).optional(),
    siren: z.string().max(9).optional(),
    vatNumber: z.string().max(20).optional(),
    legalForm: z.string().max(120).optional(),
  })
  .strict();
export type CreateCandidateCompanyBody = z.infer<typeof CreateCandidateCompanyBodySchema>;

export const ListCandidateCompaniesQuerySchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    includeArchived: z.coerce.boolean().optional(),
  })
  .strict();
export type ListCandidateCompaniesQuery = z.infer<typeof ListCandidateCompaniesQuerySchema>;

export const AddCandidateEstablishmentBodySchema = z
  .object({
    siret: z.string().length(14),
    label: z.string().max(200).optional(),
    isPrincipal: z.boolean().optional(),
    addressLine: z.string().max(300).optional(),
    postalCode: z.string().max(20).optional(),
    city: z.string().max(120).optional(),
    country: z.string().max(10).optional(),
  })
  .strict();
export type AddCandidateEstablishmentBody = z.infer<typeof AddCandidateEstablishmentBodySchema>;
