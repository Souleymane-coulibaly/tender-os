import type { OrganizationMembership } from "../../domain/organization-membership.aggregate";
import type { OrganizationRole } from "../../domain/organization-role";

export type MembershipPage = {
  items: OrganizationMembership[];
  nextCursor: string | null;
};

/**
 * `organization_memberships` est tenant-scoped : toute lecture d'une Membership précise
 * exige l'organizationId (skills/platform-foundation/DATABASE_PATTERNS.md §14 — jamais
 * `findById(membershipId)` seul).
 */
export interface MembershipRepository {
  findById(input: { organizationId: string; membershipId: string }): Promise<OrganizationMembership | null>;
  findByOrganizationAndUser(input: {
    organizationId: string;
    userId: string;
  }): Promise<OrganizationMembership | null>;
  listByOrganization(input: {
    organizationId: string;
    cursor?: string | undefined;
    limit: number;
  }): Promise<MembershipPage>;
  listByUser(input: { userId: string; cursor?: string | undefined; limit: number }): Promise<MembershipPage>;
  countActiveByOrganizationAndRole(input: { organizationId: string; role: OrganizationRole }): Promise<number>;
  countActiveByOrganization(organizationId: string): Promise<number>;
  save(membership: OrganizationMembership): Promise<void>;
}

export const MEMBERSHIP_REPOSITORY = Symbol("MEMBERSHIP_REPOSITORY");
