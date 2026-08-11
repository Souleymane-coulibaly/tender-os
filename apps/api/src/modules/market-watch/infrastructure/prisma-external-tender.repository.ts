import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { ExternalTender } from "../domain/external-tender.entity";
import type { ExternalTenderListFilter, ExternalTenderPage, ExternalTenderRepository } from "../application/ports/external-tender.repository";
import { toDomainExternalTender, toExternalTenderData } from "./external-tender.persistence-mapper";

@Injectable()
export class PrismaExternalTenderRepository implements ExternalTenderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(tender: ExternalTender): Promise<void> {
    await this.prisma.currentClient().externalTender.create({ data: toExternalTenderData(tender) });
  }

  async save(tender: ExternalTender): Promise<void> {
    await this.prisma.currentClient().externalTender.update({
      where: { id_organizationId: { id: tender.id, organizationId: tender.organizationId } },
      data: toExternalTenderData(tender),
    });
  }

  async findBySourceAndExternalId(input: { organizationId: string; source: string; externalId: string }): Promise<ExternalTender | null> {
    const row = await this.prisma.currentClient().externalTender.findUnique({
      where: { organizationId_source_externalId: { organizationId: input.organizationId, source: input.source, externalId: input.externalId } },
    });
    return row ? toDomainExternalTender(row) : null;
  }

  async findById(input: { organizationId: string; externalTenderId: string }): Promise<ExternalTender | null> {
    const row = await this.prisma.currentClient().externalTender.findFirst({ where: { id: input.externalTenderId, organizationId: input.organizationId } });
    return row ? toDomainExternalTender(row) : null;
  }

  async findManyByIds(input: { organizationId: string; externalTenderIds: readonly string[] }): Promise<ExternalTender[]> {
    if (input.externalTenderIds.length === 0) return [];
    const rows = await this.prisma.currentClient().externalTender.findMany({ where: { organizationId: input.organizationId, id: { in: [...input.externalTenderIds] } } });
    return rows.map(toDomainExternalTender);
  }

  /** Mission §81/§84 — mots-clés via ILIKE (index trigram GIN posé en migration), le reste via des
   *  conditions Prisma standard. Toujours borné par `organizationId` (mission §73). */
  async list(filter: ExternalTenderListFilter): Promise<ExternalTenderPage> {
    const andConditions: Prisma.ExternalTenderWhereInput[] = [];

    if (filter.keywords && filter.keywords.length > 0) {
      andConditions.push({ OR: filter.keywords.map((keyword) => ({ OR: [{ title: { contains: keyword, mode: "insensitive" } }, { description: { contains: keyword, mode: "insensitive" } }] })) });
    }
    if (filter.cpvCodes && filter.cpvCodes.length > 0) {
      andConditions.push({ cpvCodes: { hasSome: [...filter.cpvCodes] } });
    }
    if (filter.countries && filter.countries.length > 0) {
      andConditions.push({ country: { in: [...filter.countries] } });
    }
    if (filter.regions && filter.regions.length > 0) {
      andConditions.push({ region: { in: [...filter.regions] } });
    }
    if (filter.departments && filter.departments.length > 0) {
      andConditions.push({ department: { in: [...filter.departments] } });
    }
    if (filter.sources && filter.sources.length > 0) {
      andConditions.push({ source: { in: [...filter.sources] } });
    }
    if (filter.marketTypes && filter.marketTypes.length > 0) {
      andConditions.push({ marketType: { in: [...filter.marketTypes] } });
    }
    if (filter.minAmount !== undefined) {
      andConditions.push({ estimatedAmount: { gte: filter.minAmount } });
    }
    if (filter.maxAmount !== undefined) {
      andConditions.push({ estimatedAmount: { lte: filter.maxAmount } });
    }
    if (filter.publishedAfter) {
      andConditions.push({ publicationDate: { gte: filter.publishedAfter } });
    }
    if (filter.deadlineBefore) {
      andConditions.push({ submissionDeadline: { lte: filter.deadlineBefore } });
    }

    const where: Prisma.ExternalTenderWhereInput = { organizationId: filter.organizationId, ...(andConditions.length > 0 ? { AND: andConditions } : {}) };

    const sortField = filter.sort === "deadline" ? "submissionDeadline" : filter.sort === "amount" ? "estimatedAmount" : "publicationDate";

    const records = await this.prisma.currentClient().externalTender.findMany({
      where,
      orderBy: [{ [sortField]: "desc" }, { id: "desc" }],
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });

    const hasNextPage = records.length > filter.limit;
    const page = hasNextPage ? records.slice(0, filter.limit) : records;

    return { items: page.map(toDomainExternalTender), nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null };
  }
}
