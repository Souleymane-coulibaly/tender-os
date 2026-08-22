import { Injectable } from "@nestjs/common";
import type { Prisma, Tender as TenderRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { TenderCountByStatusFilter, TenderListCreatedAtFilter, TenderListFilter, TenderPage, TenderRepository } from "../application/ports/tender.repository";
import { TenderConcurrentModificationError } from "../domain/errors";
import { TenderStatus } from "../domain/tender-status";
import type { Tender } from "../domain/tender.aggregate";
import { TenderPersistenceMapper } from "./tender.persistence-mapper";

/** Statuts pour lesquels une échéance de soumission passée n'est plus "en retard" au sens
 *  du filtre `overdue` de la vue Liste — le dépôt a déjà eu lieu ou le dossier est clos. */
const STATUSES_EXEMPT_FROM_OVERDUE: readonly string[] = [
  TenderStatus.Submitted,
  TenderStatus.Won,
  TenderStatus.Lost,
  TenderStatus.Archived,
];

function buildWhere(input: TenderListFilter): Prisma.TenderWhereInput {
  const andConditions: Prisma.TenderWhereInput[] = [];
  if (input.status) andConditions.push({ status: input.status });
  if (input.internalOwnerId) andConditions.push({ internalOwnerId: input.internalOwnerId });
  if (input.clientAccountId) andConditions.push({ clientAccountId: input.clientAccountId });
  if (input.restrictToClientAccountIds) andConditions.push({ clientAccountId: { in: [...input.restrictToClientAccountIds] } });
  if (input.idsFilter) andConditions.push({ id: { in: [...input.idsFilter] } });
  if (input.deadlineAfter) andConditions.push({ submissionDeadline: { gte: input.deadlineAfter } });
  if (input.deadlineBefore) andConditions.push({ submissionDeadline: { lte: input.deadlineBefore } });
  if (input.updatedSince) andConditions.push({ updatedAt: { gte: input.updatedSince } });
  if (input.overdue) {
    andConditions.push({
      submissionDeadline: { lt: new Date() },
      status: { notIn: [...STATUSES_EXEMPT_FROM_OVERDUE] },
    });
  }

  return {
    organizationId: input.organizationId,
    ...(andConditions.length > 0 ? { AND: andConditions } : {}),
  };
}

@Injectable()
export class PrismaTenderRepository implements TenderRepository {
  private readonly mapper = new TenderPersistenceMapper();

  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; tenderId: string }): Promise<Tender | null> {
    const record = await this.prisma.currentClient().tender.findFirst({
      where: { id: input.tenderId, organizationId: input.organizationId },
    });

    return record ? this.mapper.toDomain(record) : null;
  }

  async list(
    input: TenderListFilter & {
      cursor?: string | undefined;
      limit: number;
      sort?: "createdAt" | "submissionDeadline" | "title" | "updatedAt" | undefined;
      sortDirection?: "asc" | "desc" | undefined;
    },
  ): Promise<TenderPage> {
    if (input.idsFilter && input.idsFilter.length === 0) {
      return { items: [], nextCursor: null };
    }

    const sortField = input.sort ?? "createdAt";
    const sortDirection = input.sortDirection ?? "desc";
    const where = buildWhere(input);

    const records = await this.prisma.currentClient().tender.findMany({
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

  async count(input: TenderListFilter): Promise<number> {
    if (input.idsFilter && input.idsFilter.length === 0) {
      return 0;
    }
    return this.prisma.currentClient().tender.count({ where: buildWhere(input) });
  }

  async countByStatus(input: TenderCountByStatusFilter): Promise<Record<string, number>> {
    const groups = await this.prisma.currentClient().tender.groupBy({
      by: ["status"],
      where: {
        organizationId: input.organizationId,
        ...(input.restrictToClientAccountIds ? { clientAccountId: { in: [...input.restrictToClientAccountIds] } } : {}),
      },
      _count: { _all: true },
    });

    return Object.fromEntries(groups.map((group) => [group.status, group._count._all]));
  }

  /** Checkpoint E5 (Dashboard V2 Premium Analytics) — projection colonne unique, bornée par
   *  `since`/`limit`, jamais un `findMany` complet de l'organisation. */
  async listCreatedAtSince(input: TenderListCreatedAtFilter): Promise<readonly Date[]> {
    const records = await this.prisma.currentClient().tender.findMany({
      where: {
        organizationId: input.organizationId,
        createdAt: { gte: input.since },
        ...(input.restrictToClientAccountIds ? { clientAccountId: { in: [...input.restrictToClientAccountIds] } } : {}),
      },
      select: { createdAt: true },
      take: input.limit,
    });
    return records.map((record) => record.createdAt);
  }

  async save(tender: Tender): Promise<void> {
    const data = this.mapper.toPersistence(tender);
    const existing = await this.prisma.currentClient().tender.findUnique({ where: { id: data.id }, select: { id: true } });

    if (!existing) {
      await this.prisma.currentClient().tender.create({ data });
      return;
    }

    const expectedPreviousVersion = data.version - 1;
    const result = await this.prisma.currentClient().tender.updateMany({
      where: { id: data.id, version: expectedPreviousVersion },
      data,
    });

    if (result.count === 0) {
      throw new TenderConcurrentModificationError();
    }
  }
}
