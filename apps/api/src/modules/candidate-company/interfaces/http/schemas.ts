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

/**
 * Checkpoint TENDEROS-2.1-CCV2-F.2 — patch d'identite juridique.
 *
 * `.strict()` est la protection anti-mass-assignment de PREMIERE ligne : toute cle inconnue
 * (`organizationId`, `sourceClientAccountId`, `clientAccountId`, `status`, `createdBy`...) fait
 * echouer la validation, la requete n'atteint jamais le use case. La seconde ligne est le TYPE du
 * patch dans le use case, la troisieme la liste blanche de `CandidateCompany.updateIdentity` :
 * trois barrieres independantes, aucune ne reposant sur les deux autres.
 *
 * `.nullable()` distingue « champ absent » (ne pas toucher) de `null` (effacer explicitement) —
 * sans quoi un champ optionnel une fois renseigne ne pourrait plus jamais etre vide.
 */
export const UpdateCandidateCompanyBodySchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    legalName: z.string().max(240).nullable().optional(),
    tradeName: z.string().max(240).nullable().optional(),
    siren: z.string().max(9).nullable().optional(),
    vatNumber: z.string().max(20).nullable().optional(),
    legalForm: z.string().max(120).nullable().optional(),
  })
  .strict()
  // Un patch vide n'est pas une mise a jour : le refuser evite une ecriture et une ligne d'audit
  // qui ne correspondent a aucun changement reel.
  .refine((body) => Object.keys(body).length > 0, { message: "At least one field must be provided." });
export type UpdateCandidateCompanyBody = z.infer<typeof UpdateCandidateCompanyBodySchema>;
