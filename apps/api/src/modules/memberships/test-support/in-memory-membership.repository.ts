import type { MembershipPage, MembershipRepository } from "../application/ports/membership.repository";
import type { OrganizationMembership } from "../domain/organization-membership.aggregate";
import type { OrganizationRole } from "../domain/organization-role";
import { MembershipStatus } from "../domain/membership-status";

export class InMemoryMembershipRepository implements MembershipRepository {
  private readonly records = new Map<string, OrganizationMembership>();

  async findById(input: { organizationId: string; membershipId: string }): Promise<OrganizationMembership | null> {
    const membership = this.records.get(input.membershipId);

    return membership && membership.organizationId === input.organizationId ? membership : null;
  }

  async findByOrganizationAndUser(input: {
    organizationId: string;
    userId: string;
  }): Promise<OrganizationMembership | null> {
    for (const membership of this.records.values()) {
      if (membership.organizationId === input.organizationId && membership.userId === input.userId) {
        return membership;
      }
    }

    return null;
  }

  async listByOrganization(input: {
    organizationId: string;
    cursor?: string | undefined;
    limit: number;
  }): Promise<MembershipPage> {
    const all = [...this.records.values()]
      .filter((membership) => membership.organizationId === input.organizationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.value.localeCompare(b.id.value));

    return paginate(all, input.cursor, input.limit);
  }

  async listByUser(input: {
    userId: string;
    cursor?: string | undefined;
    limit: number;
  }): Promise<MembershipPage> {
    const all = [...this.records.values()]
      .filter((membership) => membership.userId === input.userId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.value.localeCompare(b.id.value));

    return paginate(all, input.cursor, input.limit);
  }

  async countActiveByOrganizationAndRole(input: { organizationId: string; role: OrganizationRole }): Promise<number> {
    let count = 0;
    for (const membership of this.records.values()) {
      if (
        membership.organizationId === input.organizationId &&
        membership.role === input.role &&
        membership.status === MembershipStatus.Active
      ) {
        count += 1;
      }
    }
    return count;
  }

  async countActiveByOrganization(organizationId: string): Promise<number> {
    let count = 0;
    for (const membership of this.records.values()) {
      if (membership.organizationId === organizationId && membership.status === MembershipStatus.Active) {
        count += 1;
      }
    }
    return count;
  }

  async save(membership: OrganizationMembership): Promise<void> {
    this.records.set(membership.id.value, membership);
  }

  async seed(membership: OrganizationMembership): Promise<void> {
    await this.save(membership);
  }
}

function paginate(all: OrganizationMembership[], cursor: string | undefined, limit: number): MembershipPage {
  const startIndex = cursor ? all.findIndex((item) => item.id.value === cursor) + 1 : 0;
  const page = all.slice(startIndex, startIndex + limit);
  const hasNextPage = startIndex + limit < all.length;

  return {
    items: page,
    nextCursor: hasNextPage ? (page[page.length - 1]?.id.value ?? null) : null,
  };
}
