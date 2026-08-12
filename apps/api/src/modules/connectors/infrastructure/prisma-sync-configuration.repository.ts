import { Injectable } from "@nestjs/common";
import type { SyncConfiguration as SyncConfigurationRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { SyncDirection } from "../domain/enums";
import { SyncConfiguration } from "../domain/sync-configuration.entity";
import type { SyncConfigurationRepository } from "../application/ports/sync-configuration.repository";

function toDomain(record: SyncConfigurationRecord): SyncConfiguration {
  return SyncConfiguration.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    connectionId: record.connectionId,
    clientAccountId: record.clientAccountId ?? undefined,
    tenderId: record.tenderId ?? undefined,
    remoteContainerId: record.remoteContainerId,
    remoteFolderId: record.remoteFolderId,
    direction: record.direction as SyncDirection,
    enabled: record.enabled,
    conflictPolicy: record.conflictPolicy,
    lastSyncAt: record.lastSyncAt ?? undefined,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

@Injectable()
export class PrismaSyncConfigurationRepository implements SyncConfigurationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; syncConfigurationId: string }): Promise<SyncConfiguration | null> {
    const record = await this.prisma.currentClient().syncConfiguration.findFirst({ where: { id: input.syncConfigurationId, organizationId: input.organizationId } });
    return record ? toDomain(record) : null;
  }

  async listByOrganization(input: { organizationId: string }): Promise<readonly SyncConfiguration[]> {
    const records = await this.prisma.currentClient().syncConfiguration.findMany({ where: { organizationId: input.organizationId }, orderBy: { createdAt: "desc" } });
    return records.map(toDomain);
  }

  async save(config: SyncConfiguration): Promise<void> {
    const data = {
      id: config.id,
      organizationId: config.organizationId,
      connectionId: config.connectionId,
      clientAccountId: config.clientAccountId ?? null,
      tenderId: config.tenderId ?? null,
      remoteContainerId: config.remoteContainerId,
      remoteFolderId: config.remoteFolderId,
      direction: config.direction,
      enabled: config.enabled,
      conflictPolicy: config.conflictPolicy,
      lastSyncAt: config.lastSyncAt ?? null,
      createdBy: config.createdBy,
    };
    await this.prisma.currentClient().syncConfiguration.upsert({ where: { id: data.id }, create: data, update: data });
  }
}
