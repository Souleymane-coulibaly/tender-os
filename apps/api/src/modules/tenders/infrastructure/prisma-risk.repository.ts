import { Injectable } from "@nestjs/common";
import type { TenderRisk as RiskRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { RiskRepository } from "../application/ports/risk.repository";
import { Risk, type RiskSeverity, type RiskStatus } from "../domain/risk.entity";

function toDomain(record: RiskRecord): Risk {
  return Risk.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    title: record.title,
    description: record.description ?? undefined,
    severity: record.severity as RiskSeverity,
    source: record.source ?? undefined,
    status: record.status as RiskStatus,
    mitigation: record.mitigation ?? undefined,
    assignedTo: record.assignedTo ?? undefined,
    resolvedAt: record.resolvedAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function toPersistence(risk: Risk) {
  return {
    id: risk.id,
    organizationId: risk.organizationId,
    tenderId: risk.tenderId,
    title: risk.title,
    description: risk.description ?? null,
    severity: risk.severity,
    source: risk.source ?? null,
    status: risk.status,
    mitigation: risk.mitigation ?? null,
    assignedTo: risk.assignedTo ?? null,
    resolvedAt: risk.resolvedAt ?? null,
    createdAt: risk.createdAt,
    updatedAt: risk.updatedAt,
  };
}

@Injectable()
export class PrismaRiskRepository implements RiskRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; tenderId: string; riskId: string }): Promise<Risk | null> {
    const record = await this.prisma.tenderRisk.findFirst({
      where: { id: input.riskId, tenderId: input.tenderId, organizationId: input.organizationId },
    });
    return record ? toDomain(record) : null;
  }

  async listByTender(input: { organizationId: string; tenderId: string }): Promise<Risk[]> {
    const records = await this.prisma.tenderRisk.findMany({
      where: { tenderId: input.tenderId, organizationId: input.organizationId },
      orderBy: { createdAt: "asc" },
    });
    return records.map(toDomain);
  }

  async listByTenderIds(input: { organizationId: string; tenderIds: readonly string[] }): Promise<Risk[]> {
    if (input.tenderIds.length === 0) return [];
    const records = await this.prisma.tenderRisk.findMany({
      where: { organizationId: input.organizationId, tenderId: { in: [...input.tenderIds] } },
    });
    return records.map(toDomain);
  }

  async save(risk: Risk): Promise<void> {
    const data = toPersistence(risk);
    await this.prisma.tenderRisk.upsert({ where: { id: data.id }, create: data, update: data });
  }
}
