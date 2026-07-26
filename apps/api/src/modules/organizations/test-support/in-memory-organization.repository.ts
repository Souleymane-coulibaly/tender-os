import type { OrganizationPage, OrganizationRepository } from "../application/ports/organization.repository";
import type { Organization } from "../domain/organization.aggregate";
import type { OrganizationId } from "../domain/organization-id.value-object";
import type { OrganizationSlug } from "../domain/organization-slug.value-object";
import { OrganizationStatus } from "../domain/organization-status";

export class InMemoryOrganizationRepository implements OrganizationRepository {
  private readonly records = new Map<string, Organization>();

  async findById(id: OrganizationId): Promise<Organization | null> {
    const organization = this.records.get(id.value);

    return organization && !organization.deletedAt ? organization : null;
  }

  async findBySlug(slug: OrganizationSlug): Promise<Organization | null> {
    for (const organization of this.records.values()) {
      if (!organization.deletedAt && organization.slug.equals(slug)) {
        return organization;
      }
    }

    return null;
  }

  async list(input: {
    cursor?: string | undefined;
    limit: number;
    status?: OrganizationStatus | undefined;
  }): Promise<OrganizationPage> {
    const all = [...this.records.values()]
      .filter((organization) => !organization.deletedAt && (!input.status || organization.status === input.status))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.value.localeCompare(b.id.value));

    const startIndex = input.cursor ? all.findIndex((item) => item.id.value === input.cursor) + 1 : 0;
    const page = all.slice(startIndex, startIndex + input.limit);
    const hasNextPage = startIndex + input.limit < all.length;

    return {
      items: page,
      nextCursor: hasNextPage ? (page[page.length - 1]?.id.value ?? null) : null,
    };
  }

  async countByStatus(): Promise<Record<OrganizationStatus, number>> {
    const counts: Record<OrganizationStatus, number> = {
      [OrganizationStatus.Trial]: 0,
      [OrganizationStatus.Active]: 0,
      [OrganizationStatus.Suspended]: 0,
      [OrganizationStatus.Closed]: 0,
    };

    for (const organization of this.records.values()) {
      if (!organization.deletedAt) {
        counts[organization.status] += 1;
      }
    }

    return counts;
  }

  async save(organization: Organization): Promise<void> {
    this.records.set(organization.id.value, organization);
  }

  async seed(organization: Organization): Promise<void> {
    await this.save(organization);
  }

  get savedIds(): string[] {
    return [...this.records.keys()];
  }
}
