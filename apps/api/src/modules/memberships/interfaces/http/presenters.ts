import type { MembershipSummary } from "../../application/dtos";
import type { OrganizationMemberView } from "../../application/use-cases/list-organization-members.use-case";
import type { MyMembershipView } from "../../application/use-cases/list-my-memberships.use-case";

/**
 * Point de contrôle unique des champs exposés (skills/platform-foundation/API_PATTERNS.md §32).
 */
export type MembershipResponse = Readonly<MembershipSummary>;

export function presentMembership(membership: MembershipSummary): MembershipResponse {
  return {
    id: membership.id,
    organizationId: membership.organizationId,
    userId: membership.userId,
    role: membership.role,
    status: membership.status,
    joinedAt: membership.joinedAt,
    suspendedAt: membership.suspendedAt,
    expiresAt: membership.expiresAt,
    createdAt: membership.createdAt,
    updatedAt: membership.updatedAt,
  };
}

export type OrganizationMemberResponse = MembershipResponse & {
  user: { id: string; email: string; displayName: string };
};

export function presentOrganizationMember(member: OrganizationMemberView): OrganizationMemberResponse {
  return {
    ...presentMembership(member),
    user: { id: member.user.id, email: member.user.email, displayName: member.user.displayName },
  };
}

export type MyMembershipResponse = MembershipResponse & {
  organization: { id: string; name: string; slug: string };
};

export function presentMyMembership(membership: MyMembershipView): MyMembershipResponse {
  return {
    ...presentMembership(membership),
    organization: {
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
    },
  };
}

export type PageResponse<T> = Readonly<{
  items: readonly T[];
  pageInfo: Readonly<{ hasNextPage: boolean; nextCursor: string | null }>;
}>;

export function presentPage<T>(items: readonly T[], nextCursor: string | null): PageResponse<T> {
  return { items, pageInfo: { hasNextPage: nextCursor !== null, nextCursor } };
}
