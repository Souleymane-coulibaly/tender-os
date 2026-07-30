import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { ClientAccountRepository, ListClientAccountsFilter, ListClientAccountsResult } from "../application/ports/client-account.repository";
import { ClientAccountHasDependenciesError, DuplicateClientAccountNameError } from "../domain/errors";
import type { ClientAccount } from "../domain/client-account.aggregate";
import { toDomain, toPersistence } from "./client-account.persistence-mapper";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isForeignKeyRestrictViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

@Injectable()
export class PrismaClientAccountRepository implements ClientAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; clientAccountId: string }): Promise<ClientAccount | null> {
    const record = await this.prisma.clientAccount.findFirst({ where: { id: input.clientAccountId, organizationId: input.organizationId } });
    return record ? toDomain(record) : null;
  }

  async findByNormalizedName(input: { organizationId: string; nameNormalized: string }): Promise<ClientAccount | null> {
    const record = await this.prisma.clientAccount.findFirst({ where: { organizationId: input.organizationId, nameNormalized: input.nameNormalized } });
    return record ? toDomain(record) : null;
  }

  async create(client: ClientAccount): Promise<void> {
    try {
      await this.prisma.clientAccount.create({ data: toPersistence(client) });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new DuplicateClientAccountNameError();
      }
      throw error;
    }
  }

  async save(client: ClientAccount): Promise<void> {
    const data = toPersistence(client);
    try {
      await this.prisma.clientAccount.update({ where: { id: data.id }, data });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new DuplicateClientAccountNameError();
      }
      throw error;
    }
  }

  async delete(input: { organizationId: string; clientAccountId: string }): Promise<void> {
    try {
      await this.prisma.clientAccount.delete({ where: { id: input.clientAccountId, organizationId: input.organizationId } });
    } catch (error) {
      if (isForeignKeyRestrictViolation(error)) {
        throw new ClientAccountHasDependenciesError();
      }
      throw error;
    }
  }

  async countTendersByClient(input: { organizationId: string; clientAccountId: string }): Promise<number> {
    return this.prisma.tender.count({ where: { organizationId: input.organizationId, clientAccountId: input.clientAccountId } });
  }

  async countAssignmentsByClient(input: { organizationId: string; clientAccountId: string }): Promise<number> {
    return this.prisma.clientAssignment.count({ where: { organizationId: input.organizationId, clientAccountId: input.clientAccountId } });
  }

  async list(filter: ListClientAccountsFilter): Promise<ListClientAccountsResult> {
    const andConditions: Prisma.ClientAccountWhereInput[] = [];
    if (filter.status) andConditions.push({ status: filter.status });
    if (filter.restrictToClientAccountIds) andConditions.push({ id: { in: [...filter.restrictToClientAccountIds] } });
    if (filter.nameSearch) andConditions.push({ name: { contains: filter.nameSearch, mode: "insensitive" } });
    if (!filter.includeArchived) andConditions.push({ archivedAt: null });

    const where: Prisma.ClientAccountWhereInput = {
      organizationId: filter.organizationId,
      ...(andConditions.length > 0 ? { AND: andConditions } : {}),
    };

    const orderBy: Prisma.ClientAccountOrderByWithRelationInput[] = [{ name: "asc" }, { id: "asc" }];

    const [records, total] = await Promise.all([
      this.prisma.clientAccount.findMany({
        where,
        orderBy,
        take: filter.limit + 1,
        ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      }),
      this.prisma.clientAccount.count({ where }),
    ]);

    const hasNextPage = records.length > filter.limit;
    const page = hasNextPage ? records.slice(0, filter.limit) : records;

    return {
      items: page.map(toDomain),
      nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null,
      total,
    };
  }
}
