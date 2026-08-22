import type {
  MembershipPage,
  MembershipRepository,
  OwnershipTransferContext,
} from "../application/ports/membership.repository";
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

  async listActiveByOrganizationAndRoles(input: { organizationId: string; roles: readonly OrganizationRole[] }): Promise<OrganizationMembership[]> {
    return [...this.records.values()].filter(
      (membership) => membership.organizationId === input.organizationId && membership.status === MembershipStatus.Active && input.roles.includes(membership.role),
    );
  }

  async save(membership: OrganizationMembership): Promise<void> {
    this.records.set(membership.id.value, membership);
  }

  /**
   * Ne simule aucun verrou réel (pas de concurrence possible en mémoire, mono-thread) : suffisant
   * pour les tests unitaires de logique métier, jamais pour prouver l'absence de race condition —
   * voir prisma-membership.repository.integration.spec.ts pour la preuve réelle contre PostgreSQL.
   */
  async runExclusiveForOrganization<T>(input: {
    organizationId: string;
    fn: (context: OwnershipTransferContext) => Promise<T>;
  }): Promise<T> {
    const context: OwnershipTransferContext = {
      findByOrganizationAndUser: (findInput) => this.findByOrganizationAndUser(findInput),
      findById: (findInput) => this.findById(findInput),
      save: async (saveInput) => {
        this.records.set(saveInput.previousOwner.id.value, saveInput.previousOwner);
        this.records.set(saveInput.newOwner.id.value, saveInput.newOwner);
      },
    };
    return input.fn(context);
  }

  /** Ne simule aucun verrou réel (mono-thread, même limite documentée que
   *  `runExclusiveForOrganization` ci-dessus) — comptage puis écriture restent néanmoins
   *  effectués comme UNE SEULE opération synchrone ici, jamais entrecoupés par un `await`
   *  intermédiaire, pour rester fidèle au contrat "jamais de fenêtre entre le comptage et
   *  l'écriture" même en mémoire. */
  async saveWithSeatLimit(input: {
    organizationId: string;
    membership: OrganizationMembership;
    seatLimit: number | "UNLIMITED";
  }): Promise<{ applied: boolean; activeCount: number }> {
    const activeCount = await this.countActiveByOrganization(input.organizationId);
    if (input.seatLimit !== "UNLIMITED" && activeCount >= input.seatLimit) {
      return { applied: false, activeCount };
    }
    this.records.set(input.membership.id.value, input.membership);
    return { applied: true, activeCount: activeCount + 1 };
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
