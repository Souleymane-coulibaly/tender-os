import { Injectable } from "@nestjs/common";
import type { TenderAlert as AlertRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { AlertRepository } from "../application/ports/alert.repository";
import { Alert, type AlertSeverity } from "../domain/alert.entity";

function toDomain(record: AlertRecord): Alert {
  return Alert.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    type: record.type,
    severity: record.severity as AlertSeverity,
    message: record.message,
    source: record.source ?? undefined,
    resolved: record.resolved,
    resolvedAt: record.resolvedAt ?? undefined,
    resolvedBy: record.resolvedBy ?? undefined,
    createdAt: record.createdAt,
  });
}

function toPersistence(alert: Alert) {
  return {
    id: alert.id,
    organizationId: alert.organizationId,
    tenderId: alert.tenderId,
    type: alert.type,
    severity: alert.severity,
    message: alert.message,
    source: alert.source ?? null,
    resolved: alert.resolved,
    resolvedAt: alert.resolvedAt ?? null,
    resolvedBy: alert.resolvedBy ?? null,
    createdAt: alert.createdAt,
  };
}

@Injectable()
export class PrismaAlertRepository implements AlertRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; tenderId: string; alertId: string }): Promise<Alert | null> {
    const record = await this.prisma.tenderAlert.findFirst({
      where: { id: input.alertId, tenderId: input.tenderId, organizationId: input.organizationId },
    });
    return record ? toDomain(record) : null;
  }

  async listByTender(input: { organizationId: string; tenderId: string }): Promise<Alert[]> {
    const records = await this.prisma.tenderAlert.findMany({
      where: { tenderId: input.tenderId, organizationId: input.organizationId },
      orderBy: { createdAt: "desc" },
    });
    return records.map(toDomain);
  }

  async listByTenderIds(input: { organizationId: string; tenderIds: readonly string[] }): Promise<Alert[]> {
    if (input.tenderIds.length === 0) return [];
    const records = await this.prisma.tenderAlert.findMany({
      where: { organizationId: input.organizationId, tenderId: { in: [...input.tenderIds] } },
    });
    return records.map(toDomain);
  }

  async save(alert: Alert): Promise<void> {
    const data = toPersistence(alert);
    await this.prisma.tenderAlert.upsert({ where: { id: data.id }, create: data, update: data });
  }
}
