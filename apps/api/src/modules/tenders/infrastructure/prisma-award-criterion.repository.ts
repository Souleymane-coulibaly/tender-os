import { Injectable } from "@nestjs/common";
import type { TenderAwardCriterion as CriterionRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { AwardCriterionRepository } from "../application/ports/award-criterion.repository";
import { AwardCriterion } from "../domain/award-criterion.entity";

function toDomain(record: CriterionRecord): AwardCriterion {
  return AwardCriterion.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    name: record.name,
    description: record.description ?? undefined,
    weight: record.weight.toString(),
    parentCriterionId: record.parentCriterionId ?? undefined,
    displayOrder: record.displayOrder,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function toPersistence(criterion: AwardCriterion) {
  return {
    id: criterion.id,
    organizationId: criterion.organizationId,
    tenderId: criterion.tenderId,
    name: criterion.name,
    description: criterion.description ?? null,
    weight: criterion.weight,
    parentCriterionId: criterion.parentCriterionId ?? null,
    displayOrder: criterion.displayOrder,
    createdAt: criterion.createdAt,
    updatedAt: criterion.updatedAt,
  };
}

@Injectable()
export class PrismaAwardCriterionRepository implements AwardCriterionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: {
    organizationId: string;
    tenderId: string;
    criterionId: string;
  }): Promise<AwardCriterion | null> {
    const record = await this.prisma.tenderAwardCriterion.findFirst({
      where: { id: input.criterionId, tenderId: input.tenderId, organizationId: input.organizationId },
    });
    return record ? toDomain(record) : null;
  }

  async listByTender(input: { organizationId: string; tenderId: string }): Promise<AwardCriterion[]> {
    const records = await this.prisma.tenderAwardCriterion.findMany({
      where: { tenderId: input.tenderId, organizationId: input.organizationId },
      orderBy: { displayOrder: "asc" },
    });
    return records.map(toDomain);
  }

  async save(criterion: AwardCriterion): Promise<void> {
    const data = toPersistence(criterion);
    await this.prisma.tenderAwardCriterion.upsert({ where: { id: data.id }, create: data, update: data });
  }

  async delete(input: { organizationId: string; tenderId: string; criterionId: string }): Promise<void> {
    await this.prisma.tenderAwardCriterion.deleteMany({
      where: { id: input.criterionId, tenderId: input.tenderId, organizationId: input.organizationId },
    });
  }
}
