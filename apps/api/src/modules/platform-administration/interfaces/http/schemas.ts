import { z } from "zod";

export const OrganizationIdParamSchema = z.string().uuid();

export const ListOrganizationsQuerySchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    status: z.enum(["TRIAL", "ACTIVE", "SUSPENDED", "CLOSED"]).optional(),
  })
  .strict();

export type ListOrganizationsQuery = z.infer<typeof ListOrganizationsQuerySchema>;

export const ListUsersQuerySchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    status: z.enum(["INVITED", "ACTIVE", "SUSPENDED", "DEACTIVATED"]).optional(),
  })
  .strict();

export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;

export const ListAuditLogsQuerySchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  })
  .strict();

export type ListAuditLogsQuery = z.infer<typeof ListAuditLogsQuerySchema>;

export const SuspendOrganizationBodySchema = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  // Le corps est entièrement facultatif (aucun champ requis) : un client peut omettre
  // le body plutôt que d'envoyer `{}` explicitement — `request.body` vaut alors `undefined`.
  .default({});

export type SuspendOrganizationBody = z.infer<typeof SuspendOrganizationBodySchema>;
