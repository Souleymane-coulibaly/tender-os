import { Injectable } from "@nestjs/common";
import type { Prisma, Tender as TenderRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { TenderPage, TenderRepository } from "../application/ports/tender.repository";
import { TenderConcurrentModificationError } from "../domain/errors";
import type { Tender } from "../domain/tender.aggregate";
import { TenderPersistenceMapper } from "./tender.persistence-mapper";

@Injectable()
export class PrismaTenderRepository implements TenderRepository {
  private readonly mapper = new TenderPersistenceMapper();

  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; tenderId: string }): Promise<Tender | null> {
    const record = await this.prisma.tender.findFirst({
      where: { id: input.tenderId, organizationId: input.organizationId },
    });

    return record ? this.mapper.toDomain(record) : null;
  }

  async list(input: {
    organizationId: string;
    cursor?: string | undefined;
    limit: number;
    status?: string | undefined;
    internalOwnerId?: string | undefined;
    search?: string | undefined;
    deadlineBefore?: Date | undefined;
    sort?: "createdAt" | "submissionDeadline" | "title" | undefined;
    sortDirection?: "asc" | "desc" | undefined;
  }): Promise<TenderPage> {
    const sortField = input.sort ?? "createdAt";
    const sortDirection = input.sortDirection ?? "desc";

    const where: Prisma.TenderWhereInput = {
      organizationId: input.organizationId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.internalOwnerId ? { internalOwnerId: input.internalOwnerId } : {}),
      ...(input.deadlineBefore ? { submissionDeadline: { lte: input.deadlineBefore } } : {}),
      ...(input.search
        ? {
            OR: [
              { title: { contains: input.search, mode: "insensitive" } },
              { reference: { contains: input.search, mode: "insensitive" } },
              { description: { contains: input.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const records = await this.prisma.tender.findMany({
      where,
      orderBy: [{ [sortField]: sortDirection }, { id: sortDirection }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    const hasNextPage = records.length > input.limit;
    const page = hasNextPage ? records.slice(0, input.limit) : records;

    return {
      items: page.map((record: TenderRecord) => this.mapper.toDomain(record)),
      nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async save(tender: Tender): Promise<void> {
    const data = this.mapper.toPersistence(tender);
    const existing = await this.prisma.tender.findUnique({ where: { id: data.id }, select: { id: true } });

    if (!existing) {
      await this.prisma.tender.create({ data });
      return;
    }

    const expectedPreviousVersion = data.version - 1;
    const result = await this.prisma.tender.updateMany({
      where: { id: data.id, version: expectedPreviousVersion },
      data,
    });

    if (result.count === 0) {
      throw new TenderConcurrentModificationError();
    }
  }
}
