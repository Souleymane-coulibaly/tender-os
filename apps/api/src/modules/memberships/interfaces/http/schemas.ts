import { z } from "zod";

export const MembershipIdParamSchema = z.string().uuid();

export const CreateMembershipBodySchema = z
  .object({
    userId: z.string().uuid(),
    role: z.string().trim().min(1).max(100),
    expiresAt: z.string().datetime().optional(),
  })
  .strict();

export type CreateMembershipBody = z.infer<typeof CreateMembershipBodySchema>;

export const ChangeMembershipRoleBodySchema = z
  .object({
    role: z.string().trim().min(1).max(100),
  })
  .strict();

export type ChangeMembershipRoleBody = z.infer<typeof ChangeMembershipRoleBodySchema>;

export const ListMembershipsQuerySchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  })
  .strict();

export type ListMembershipsQuery = z.infer<typeof ListMembershipsQuerySchema>;
