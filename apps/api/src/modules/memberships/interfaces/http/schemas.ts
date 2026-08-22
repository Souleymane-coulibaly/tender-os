import { z } from "zod";

export const MembershipIdParamSchema = z.string().uuid();

export const OrganizationIdParamSchema = z.string().uuid();

export const CreateMembershipBodySchema = z
  .object({
    userId: z.string().uuid(),
    role: z.string().trim().min(1).max(100),
    expiresAt: z.string().datetime().optional(),
  })
  .strict();

export type CreateMembershipBody = z.infer<typeof CreateMembershipBodySchema>;

/** Checkpoint TENDEROS-2.1-P2.3-E2 (Onboarding V2) — même forme que `CreateMembershipBodySchema`,
 *  `userId` remplacé par `email` (résolu côté serveur, voir `InviteMemberByEmailUseCase`). */
export const InviteMemberByEmailBodySchema = z
  .object({
    email: z.string().trim().min(1).max(320),
    role: z.string().trim().min(1).max(100),
    expiresAt: z.string().datetime().optional(),
  })
  .strict();

export type InviteMemberByEmailBody = z.infer<typeof InviteMemberByEmailBodySchema>;

export const ChangeMembershipRoleBodySchema = z
  .object({
    role: z.string().trim().min(1).max(100),
  })
  .strict();

export type ChangeMembershipRoleBody = z.infer<typeof ChangeMembershipRoleBodySchema>;

export const TransferOwnershipBodySchema = z
  .object({
    newOwnerMembershipId: z.string().uuid(),
  })
  .strict();

export type TransferOwnershipBody = z.infer<typeof TransferOwnershipBodySchema>;

export const ListMembershipsQuerySchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  })
  .strict();

export type ListMembershipsQuery = z.infer<typeof ListMembershipsQuerySchema>;
