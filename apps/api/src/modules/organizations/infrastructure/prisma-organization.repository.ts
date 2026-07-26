import { Injectable } from "@nestjs/common";
import type { Organization as OrganizationRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { OrganizationPage, OrganizationRepository } from "../application/ports/organization.repository";
import type { Organization } from "../domain/organization.aggregate";
import type { OrganizationId } from "../domain/organization-id.value-object";
import type { OrganizationSlug } from "../domain/organization-slug.value-object";
import { OrganizationStatus } from "../domain/organization-status";
import { OrganizationPersistenceMapper } from "./organization.persistence-mapper";

@Injectable()
export class PrismaOrganizationRepository implements OrganizationRepository {
  private readonly mapper = new OrganizationPersistenceMapper();

  constructor(private readonly prisma: PrismaService) {}

  async findById(id: OrganizationId): Promise<Organization | null> {
    const record = await this.prisma.organization.findFirst({
      where: { id: id.value, deletedAt: null },
    });

    return record ? this.mapper.toDomain(record) : null;
  }

  async findBySlug(slug: OrganizationSlug): Promise<Organization | null> {
    const record = await this.prisma.organization.findFirst({
      where: { slug: slug.value, deletedAt: null },
    });

    return record ? this.mapper.toDomain(record) : null;
  }

  async list(input: {
    cursor?: string | undefined;
    limit: number;
    status?: OrganizationStatus | undefined;
  }): Promise<OrganizationPage> {
    const records = await this.prisma.organization.findMany({
      where: { deletedAt: null, ...(input.status ? { status: input.status } : {}) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    const hasNextPage = records.length > input.limit;
    const page = hasNextPage ? records.slice(0, input.limit) : records;

    return {
      items: page.map((record: OrganizationRecord) => this.mapper.toDomain(record)),
      nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async countByStatus(): Promise<Record<OrganizationStatus, number>> {
    const rows = await this.prisma.organization.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    });

    const counts: Record<OrganizationStatus, number> = {
      [OrganizationStatus.Trial]: 0,
      [OrganizationStatus.Active]: 0,
      [OrganizationStatus.Suspended]: 0,
      [OrganizationStatus.Closed]: 0,
    };

    for (const row of rows) {
      counts[row.status as OrganizationStatus] = row._count._all;
    }

    return counts;
  }

  async save(organization: Organization): Promise<void> {
    const data = this.mapper.toPersistence(organization);

    await this.prisma.organization.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }
}
