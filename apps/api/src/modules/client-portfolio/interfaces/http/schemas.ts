import { z } from "zod";

export const IdParamSchema = z.string().uuid();

export const CreateClientAccountBodySchema = z
  .object({
    name: z.string().min(1).max(200),
    legalName: z.string().max(240).optional(),
    reference: z.string().max(100).optional(),
    sector: z.string().max(120).optional(),
    country: z.string().max(10).optional(),
    address: z.string().max(2000).optional(),
    website: z.string().url().max(2048).optional(),
    notes: z.string().max(5000).optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .strict();
export type CreateClientAccountBody = z.infer<typeof CreateClientAccountBodySchema>;

export const UpdateClientAccountBodySchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    legalName: z.string().max(240).optional(),
    reference: z.string().max(100).optional(),
    sector: z.string().max(120).optional(),
    country: z.string().max(10).optional(),
    address: z.string().max(2000).optional(),
    website: z.string().url().max(2048).optional(),
    notes: z.string().max(5000).optional(),
  })
  .strict();
export type UpdateClientAccountBody = z.infer<typeof UpdateClientAccountBodySchema>;

export const ListClientAccountsQuerySchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
    includeArchived: z.coerce.boolean().optional(),
    nameSearch: z.string().max(200).optional(),
  })
  .strict();
export type ListClientAccountsQuery = z.infer<typeof ListClientAccountsQuerySchema>;

export const AssignUserToClientBodySchema = z.object({ userId: z.string().uuid(), role: z.string().min(1).max(30) }).strict();
export type AssignUserToClientBody = z.infer<typeof AssignUserToClientBodySchema>;

export const UpdateClientAssignmentBodySchema = z.object({ role: z.string().min(1).max(30) }).strict();
export type UpdateClientAssignmentBody = z.infer<typeof UpdateClientAssignmentBodySchema>;
