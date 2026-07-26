import type { OrganizationMembership } from "../domain/organization-membership.aggregate";

export type MembershipSummary = {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  status: string;
  joinedAt?: string | undefined;
  suspendedAt?: string | undefined;
  expiresAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export function toMembershipSummary(membership: OrganizationMembership): MembershipSummary {
  return {
    id: membership.id.value,
    organizationId: membership.organizationId,
    userId: membership.userId,
    role: membership.role,
    status: membership.status,
    joinedAt: membership.joinedAt?.toISOString(),
    suspendedAt: membership.suspendedAt?.toISOString(),
    expiresAt: membership.expiresAt?.toISOString(),
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
  };
}
