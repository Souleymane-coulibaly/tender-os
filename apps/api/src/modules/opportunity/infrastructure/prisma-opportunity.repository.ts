import { Injectable } from "@nestjs/common";
import type { Opportunity as OpportunityRecord, Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { OpportunityConcurrentModificationError } from "../domain/errors";
import { Opportunity } from "../domain/opportunity.aggregate";
import { OpportunityId } from "../domain/opportunity-id.value-object";
import type { OpportunityListFilter, OpportunityPage, OpportunityRepository } from "../application/ports/opportunity.repository";
import type { OpportunityStatus } from "../domain/opportunity-status";

function toDomain(record: OpportunityRecord): Opportunity {
  return Opportunity.rehydrate({
    id: OpportunityId.from(record.id),
    organizationId: record.organizationId,
    clientAccountId: record.clientAccountId ?? undefined,
    candidateCompanyId: record.candidateCompanyId ?? undefined,
    buyerId: record.buyerId ?? undefined,
    title: record.title,
    description: record.description ?? undefined,
    source: record.source as Opportunity["source"],
    externalReference: record.externalReference ?? undefined,
    buyerName: record.buyerName ?? undefined,
    sector: record.sector ?? undefined,
    cpvCode: record.cpvCode ?? undefined,
    location: record.location ?? undefined,
    geographicZone: record.geographicZone ?? undefined,
    publicationDate: record.publicationDate ?? undefined,
    submissionDeadline: record.submissionDeadline ?? undefined,
    estimatedAmount: record.estimatedAmount?.toString(),
    currency: record.currency ?? undefined,
    procedureType: record.procedureType ?? undefined,
    status: record.status as OpportunityStatus,
    tenderId: record.tenderId ?? undefined,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    archivedAt: record.archivedAt ?? undefined,
    version: record.version,
  });
}

function toPersistence(opportunity: Opportunity) {
  return {
    id: opportunity.id.value,
    organizationId: opportunity.organizationId,
    clientAccountId: opportunity.clientAccountId ?? null,
    candidateCompanyId: opportunity.candidateCompanyId ?? null,
    buyerId: opportunity.buyerId ?? null,
    title: opportunity.title,
    description: opportunity.description ?? null,
    source: opportunity.source,
    externalReference: opportunity.externalReference ?? null,
    buyerName: opportunity.buyerName ?? null,
    sector: opportunity.sector ?? null,
    cpvCode: opportunity.cpvCode ?? null,
    location: opportunity.location ?? null,
    geographicZone: opportunity.geographicZone ?? null,
    publicationDate: opportunity.publicationDate ?? null,
    submissionDeadline: opportunity.submissionDeadline ?? null,
    estimatedAmount: opportunity.estimatedAmount ?? null,
    currency: opportunity.currency ?? null,
    procedureType: opportunity.procedureType ?? null,
    status: opportunity.status,
    tenderId: opportunity.tenderId ?? null,
    createdBy: opportunity.createdBy,
    createdAt: opportunity.createdAt,
    updatedAt: opportunity.updatedAt,
    archivedAt: opportunity.archivedAt ?? null,
    version: opportunity.version,
  };
}

function buildWhere(input: OpportunityListFilter): Prisma.OpportunityWhereInput {
  const andConditions: Prisma.OpportunityWhereInput[] = [];
  if (input.status) andConditions.push({ status: input.status });
  if (input.clientAccountId) andConditions.push({ clientAccountId: input.clientAccountId });
  if (input.restrictToClientAccountIds) {
    // Une Opportunity sans clientAccountId reste toujours visible (mission §23) — jamais masquée
    // par la restriction "clients accessibles".
    andConditions.push({ OR: [{ clientAccountId: { in: [...input.restrictToClientAccountIds] } }, { clientAccountId: null }] });
  }

  return {
    organizationId: input.organizationId,
    ...(andConditions.length > 0 ? { AND: andConditions } : {}),
  };
}

@Injectable()
export class PrismaOpportunityRepository implements OpportunityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; opportunityId: string }): Promise<Opportunity | null> {
    const record = await this.prisma.currentClient().opportunity.findFirst({
      where: { id: input.opportunityId, organizationId: input.organizationId },
    });
    return record ? toDomain(record) : null;
  }

  async list(
    input: OpportunityListFilter & {
      cursor?: string | undefined;
      limit: number;
      sort?: "createdAt" | "submissionDeadline" | "title" | "updatedAt" | undefined;
      sortDirection?: "asc" | "desc" | undefined;
    },
  ): Promise<OpportunityPage> {
    const sortField = input.sort ?? "createdAt";
    const sortDirection = input.sortDirection ?? "desc";
    const where = buildWhere(input);

    const records = await this.prisma.currentClient().opportunity.findMany({
      where,
      orderBy: [{ [sortField]: sortDirection }, { id: sortDirection }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    const hasNextPage = records.length > input.limit;
    const page = hasNextPage ? records.slice(0, input.limit) : records;

    return {
      items: page.map(toDomain),
      nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async save(opportunity: Opportunity): Promise<void> {
    const data = toPersistence(opportunity);
    const client = this.prisma.currentClient();
    const existing = await client.opportunity.findUnique({ where: { id: data.id }, select: { id: true } });

    if (!existing) {
      await client.opportunity.create({ data });
      return;
    }

    const expectedPreviousVersion = data.version - 1;
    const result = await client.opportunity.updateMany({
      where: { id: data.id, version: expectedPreviousVersion },
      data,
    });

    if (result.count === 0) {
      throw new OpportunityConcurrentModificationError();
    }
  }

  async transitionToPromoted(input: {
    organizationId: string;
    opportunityId: string;
    fromStatuses: readonly OpportunityStatus[];
    tenderId: string;
    updatedAt: Date;
  }): Promise<Opportunity | null> {
    const client = this.prisma.currentClient();
    const result = await client.opportunity.updateMany({
      where: { id: input.opportunityId, organizationId: input.organizationId, status: { in: [...input.fromStatuses] } },
      data: { status: "PROMOTED", tenderId: input.tenderId, updatedAt: input.updatedAt, version: { increment: 1 } },
    });

    if (result.count !== 1) {
      return null;
    }

    return this.findById({ organizationId: input.organizationId, opportunityId: input.opportunityId });
  }
}
