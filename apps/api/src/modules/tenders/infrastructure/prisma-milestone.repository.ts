import { Injectable } from "@nestjs/common";
import type { TenderMilestone as MilestoneRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { MilestoneRepository } from "../application/ports/milestone.repository";
import { Milestone, type MilestoneStatus, type MilestoneType } from "../domain/milestone.entity";

function toDomain(record: MilestoneRecord): Milestone {
  return Milestone.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    title: record.title,
    description: record.description ?? undefined,
    date: record.date,
    type: record.type as MilestoneType,
    status: record.status as MilestoneStatus,
    responsibleUserId: record.responsibleUserId ?? undefined,
    timezone: record.timezone ?? undefined,
    lotId: record.lotId ?? undefined,
    mandatory: record.mandatory,
    completedAt: record.completedAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function toPersistence(milestone: Milestone) {
  return {
    id: milestone.id,
    organizationId: milestone.organizationId,
    tenderId: milestone.tenderId,
    title: milestone.title,
    description: milestone.description ?? null,
    date: milestone.date,
    type: milestone.type,
    status: milestone.status,
    responsibleUserId: milestone.responsibleUserId ?? null,
    timezone: milestone.timezone ?? null,
    lotId: milestone.lotId ?? null,
    mandatory: milestone.mandatory,
    completedAt: milestone.completedAt ?? null,
    createdAt: milestone.createdAt,
    updatedAt: milestone.updatedAt,
  };
}

@Injectable()
export class PrismaMilestoneRepository implements MilestoneRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: {
    organizationId: string;
    tenderId: string;
    milestoneId: string;
  }): Promise<Milestone | null> {
    const record = await this.prisma.tenderMilestone.findFirst({
      where: { id: input.milestoneId, tenderId: input.tenderId, organizationId: input.organizationId },
    });
    return record ? toDomain(record) : null;
  }

  async listByTender(input: { organizationId: string; tenderId: string }): Promise<Milestone[]> {
    const records = await this.prisma.tenderMilestone.findMany({
      where: { tenderId: input.tenderId, organizationId: input.organizationId },
      orderBy: { date: "asc" },
    });
    return records.map(toDomain);
  }

  async listByTenderIds(input: { organizationId: string; tenderIds: readonly string[] }): Promise<Milestone[]> {
    if (input.tenderIds.length === 0) return [];
    const records = await this.prisma.tenderMilestone.findMany({
      where: { organizationId: input.organizationId, tenderId: { in: [...input.tenderIds] } },
    });
    return records.map(toDomain);
  }

  async save(milestone: Milestone): Promise<void> {
    const data = toPersistence(milestone);
    await this.prisma.tenderMilestone.upsert({ where: { id: data.id }, create: data, update: data });
  }

  async delete(input: { organizationId: string; tenderId: string; milestoneId: string }): Promise<void> {
    await this.prisma.tenderMilestone.deleteMany({
      where: { id: input.milestoneId, tenderId: input.tenderId, organizationId: input.organizationId },
    });
  }
}
