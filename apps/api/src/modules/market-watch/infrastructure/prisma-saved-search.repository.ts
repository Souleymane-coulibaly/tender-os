import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { SavedSearch } from "../domain/saved-search.entity";
import type { SavedSearchRepository } from "../application/ports/saved-search.repository";
import { toDomainSavedSearch, toSavedSearchData } from "./saved-search.persistence-mapper";

@Injectable()
export class PrismaSavedSearchRepository implements SavedSearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(search: SavedSearch): Promise<void> {
    await this.prisma.currentClient().savedSearch.create({ data: toSavedSearchData(search) });
  }

  async save(search: SavedSearch): Promise<void> {
    await this.prisma.currentClient().savedSearch.update({
      where: { id_organizationId: { id: search.id, organizationId: search.organizationId } },
      data: toSavedSearchData(search),
    });
  }

  async findById(input: { organizationId: string; savedSearchId: string }): Promise<SavedSearch | null> {
    const row = await this.prisma.currentClient().savedSearch.findFirst({ where: { id: input.savedSearchId, organizationId: input.organizationId } });
    return row ? toDomainSavedSearch(row) : null;
  }

  async listByOwner(input: { organizationId: string; ownerUserId: string }): Promise<SavedSearch[]> {
    const rows = await this.prisma.currentClient().savedSearch.findMany({ where: { organizationId: input.organizationId, ownerUserId: input.ownerUserId, deletedAt: null }, orderBy: { createdAt: "desc" } });
    return rows.map(toDomainSavedSearch);
  }

  async listActiveByOrganization(input: { organizationId: string }): Promise<SavedSearch[]> {
    const rows = await this.prisma.currentClient().savedSearch.findMany({ where: { organizationId: input.organizationId, isActive: true, deletedAt: null } });
    return rows.map(toDomainSavedSearch);
  }

  async listDistinctOrganizationIdsWithActiveSearches(): Promise<string[]> {
    const rows = await this.prisma.currentClient().savedSearch.findMany({ where: { isActive: true, deletedAt: null }, distinct: ["organizationId"], select: { organizationId: true } });
    return rows.map((row) => row.organizationId);
  }
}
